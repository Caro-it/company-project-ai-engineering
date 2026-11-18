"""Pipeline de análisis técnico de telemetría (proyecto "Telemetría – Reporte técnico").

Equivale al services/telemetry/analysis.py del enunciado: en este monorepo la API vive en
services/api/app/ (misma decisión que en el Hito 5).

Radar operacional para el equipo de ingeniería — salud del sistema, no negocio: volumen de
eventos, tasa de errores, rendimiento percibido, fallos de red y de login. Nada de ventas,
conversión ni ingresos.

Cada métrica sigue el mismo orden:
  cargar (SQL) → refinar (Pandas) → convertir tipos → agrupar → agregar → servir
- La ventana de fechas [start_date, end_date) (inicio inclusivo, fin exclusivo, UTC) y los
  event_type se filtran UNA vez, en SQL. Nunca se carga la tabla entera.
- Las dimensiones de `tags` se extraen en Pandas y se descartan las filas sin dimensión.
- `timestamp` se convierte con pd.to_datetime(..., utc=True) antes de cualquier groupby.
- Sin bucles: solo groupby/agg/count/sum/mean/quantile.
- Funciones puras: misma entrada → mismo resultado, sin escribir nada.
"""
from collections.abc import Sequence
from datetime import datetime

import pandas as pd
from sqlalchemy import Engine, select

from app.telemetry_store import TelemetryEventRecord

T = TelemetryEventRecord.__table__


def _load(
    engine: Engine,
    start_date: datetime,
    end_date: datetime,
    event_types: Sequence[str] | None = None,
    columns: Sequence[str] = ("timestamp", "event_type", "level", "tags"),
) -> pd.DataFrame:
    """SELECT de solo las columnas y filas que la métrica necesita."""
    query = select(*(T.c[name] for name in columns)).where(
        T.c.timestamp >= start_date, T.c.timestamp < end_date
    )
    if event_types:
        query = query.where(T.c.event_type.in_(list(event_types)))
    with engine.connect() as connection:
        return pd.DataFrame(connection.execute(query).mappings().all(), columns=list(columns))


def _with_day(df: pd.DataFrame) -> pd.DataFrame:
    """timestamp a datetime UTC y columna `day` (YYYY-MM-DD) para agrupar por día."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["day"] = df["timestamp"].dt.strftime("%Y-%m-%d")
    return df


def _tags(df: pd.DataFrame, keys: Sequence[str]) -> pd.DataFrame:
    """Extrae de `tags` las claves pedidas como columnas (las que falten quedan NaN)."""
    extracted = pd.json_normalize(df["tags"].tolist()).reindex(columns=list(keys))
    extracted.index = df.index
    return pd.concat([df.drop(columns=["tags"]), extracted], axis=1)


def _records(df: pd.DataFrame) -> list[dict]:
    """Lista de dicts serializable a JSON (NaN → None, numpy → tipos de Python)."""
    return df.astype(object).where(df.notna(), None).to_dict(orient="records")


# --- Métricas ---------------------------------------------------------------------------------


def events_per_day(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Qué eventos ocurren y con qué frecuencia? Volumen por día y event_type."""
    df = _load(engine, start_date, end_date, columns=("timestamp", "event_type"))
    if df.empty:
        return []
    df = _with_day(df)
    result = (
        df.groupby(["day", "event_type"])
        .size()
        .reset_index(name="events")
        .sort_values(["day", "events", "event_type"], ascending=[True, False, True])
    )
    return _records(result)


def error_rate_by_day(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Qué parte de lo que pasa es un error o un aviso? Tasas por día sobre el total.

    level lo asigna el receptor (telemetry-plan.md §5.3): error = errores técnicos,
    warn = rechazos, fallos y alertas.
    """
    df = _load(engine, start_date, end_date, columns=("timestamp", "level"))
    if df.empty:
        return []
    df = _with_day(df)
    df["is_error"] = df["level"].eq("error")
    df["is_warn"] = df["level"].eq("warn")
    result = df.groupby("day").agg(
        events=("level", "count"), errors=("is_error", "sum"), warnings=("is_warn", "sum")
    )
    result["error_rate"] = (result["errors"] / result["events"]).round(4)
    result["warn_rate"] = (result["warnings"] / result["events"]).round(4)
    return _records(result.reset_index())


def page_load_by_day(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Qué tan rápido cargan las páginas para los usuarios reales? LCP por día y página
    (mediana, p75 y muestras) a partir de page_load_recorded."""
    df = _load(engine, start_date, end_date, event_types=["page_load_recorded"], columns=("timestamp", "tags"))
    if df.empty:
        return []
    df = _tags(_with_day(df), ["page", "lcp_ms"]).dropna(subset=["page", "lcp_ms"])
    if df.empty:
        return []
    df["lcp_ms"] = pd.to_numeric(df["lcp_ms"])
    grouped = df.groupby(["day", "page"])["lcp_ms"]
    result = pd.DataFrame(
        {
            "samples": grouped.count(),
            "lcp_median_ms": grouped.median().round(0),
            "lcp_p75_ms": grouped.quantile(0.75).round(0),
        }
    )
    return _records(result.reset_index())


def auth_failure_rate(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Cuántos intentos de login fallan cada día? login_failed / (login_failed + login_succeeded).

    (El enunciado los llama user_login_failed / user_login_succeeded; en el plan de Nexova son
    login_failed / login_succeeded.)
    """
    df = _load(
        engine,
        start_date,
        end_date,
        event_types=["login_failed", "login_succeeded"],
        columns=("timestamp", "event_type"),
    )
    if df.empty:
        return []
    df = _with_day(df)
    df["failed"] = df["event_type"].eq("login_failed")
    result = df.groupby("day").agg(attempts=("event_type", "count"), failed=("failed", "sum"))
    result["failure_rate"] = (result["failed"] / result["attempts"]).round(4)
    return _records(result.reset_index())


def request_failures_by_route(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Dónde se pierde la conexión con la API? api_request_failed por día, ruta y tipo de fallo,
    con el tiempo medio hasta el fallo."""
    df = _load(engine, start_date, end_date, event_types=["api_request_failed"], columns=("timestamp", "tags"))
    if df.empty:
        return []
    df = _tags(_with_day(df), ["route", "failure_type", "elapsed_ms"]).dropna(subset=["route", "failure_type"])
    if df.empty:
        return []
    df["elapsed_ms"] = pd.to_numeric(df["elapsed_ms"])
    result = df.groupby(["day", "route", "failure_type"]).agg(
        failures=("route", "count"), avg_elapsed_ms=("elapsed_ms", "mean")
    )
    result["avg_elapsed_ms"] = result["avg_elapsed_ms"].round(0)
    return _records(result.reset_index())


def frontend_errors_by_fingerprint(engine: Engine, start_date: datetime, end_date: datetime) -> list[dict]:
    """¿Qué errores de JavaScript se repiten más? frontend_error_captured por fingerprint:
    ocurrencias, sesiones afectadas, página y última vez visto."""
    df = _load(
        engine, start_date, end_date, event_types=["frontend_error_captured"], columns=("timestamp", "tags")
    )
    if df.empty:
        return []
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = _tags(df, ["fingerprint", "error_name", "page", "_envelope.session_id"]).dropna(subset=["fingerprint"])
    if df.empty:
        return []
    result = (
        df.groupby(["fingerprint", "error_name", "page"], dropna=False)
        .agg(
            occurrences=("timestamp", "count"),
            sessions=("_envelope.session_id", "nunique"),
            last_seen=("timestamp", "max"),
        )
        .reset_index()
        .sort_values("occurrences", ascending=False)
    )
    result["last_seen"] = result["last_seen"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return _records(result)


# Orden y claves del JSON de GET /telemetry/report
METRICS = {
    "events_per_day": events_per_day,
    "error_rate_by_day": error_rate_by_day,
    "page_load_by_day": page_load_by_day,
    "auth_failure_rate": auth_failure_rate,
    "request_failures_by_route": request_failures_by_route,
    "frontend_errors_by_fingerprint": frontend_errors_by_fingerprint,
}


def build_report(engine: Engine, start_date: datetime, end_date: datetime) -> dict:
    """Todas las métricas para el mismo período."""
    return {name: metric(engine, start_date, end_date) for name, metric in METRICS.items()}
