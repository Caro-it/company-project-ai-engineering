"""Script nocturno de telemetría (ticket DEV-53).

Cada noche, para el día anterior (UTC):

1. Exporta las filas de `telemetry_events` de ese día a `data/raw/telemetry_YYYY-MM-DD.csv`,
   solo si el archivo no existe. Es una copia de respaldo y auditoría: el pipeline lee de la
   base de datos, nunca de este CSV.
2. Lanza el pipeline de datos del Hito 6 como subproceso (la semana que contiene ese día).
3. Deja constancia en `job_runs`: pending → processing → completed | failed.

Es un proceso independiente de la API: no importa FastAPI ni `app.main`, y lo dispara
crontab (o el Programador de tareas de Windows), nunca el servidor.

Uso, desde la raíz del monorepo:

    uv run --project services/api python scripts/nightly_export.py
    TARGET_DATE=2026-11-17 uv run --project services/api python scripts/nightly_export.py

Variables de entorno:
    TARGET_DATE              YYYY-MM-DD; por defecto, ayer en UTC
    DATABASE_URL             conexión; por defecto la de services/api/.env
    NIGHTLY_EXPORT_DIR       carpeta del CSV; por defecto data/raw
    NIGHTLY_PIPELINE_CMD     sustituye el comando del pipeline (pruebas)
    NIGHTLY_PIPELINE_TIMEOUT segundos máximos del pipeline; por defecto 1800
    JOB_STALE_AFTER_HOURS    horas tras las que una fila processing se da por huérfana; 6

Códigos de salida: 0 completado u omitido (duplicado o bloqueado), 1 fallido.
"""
from __future__ import annotations

import json
import logging
import os
import shlex
import signal
import subprocess
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
API_DIR = REPO_ROOT / "services" / "api"
# Permite ejecutar el script con `python scripts/nightly_export.py` desde el entorno de la API
# aunque `app` no esté en el path (uv run --project lo instala igualmente)
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import pandas as pd
from sqlalchemy import select
from sqlalchemy.engine import Engine

from app.services import job_runner

JOB_NAME = "nightly_export"
DEFAULT_EXPORT_DIR = REPO_ROOT / "data" / "raw"
PIPELINE_SCRIPT = REPO_ROOT / "data" / "pipelines" / "pipeline.py"
CSV_COLUMNS = ["id", "timestamp", "service", "event_type", "level", "value", "message", "tags"]

logger = logging.getLogger(JOB_NAME)


# --- Logs: cada línea con timestamp, nombre del job y estado --------------------------------


class _JobFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        record.job = JOB_NAME
        record.status = getattr(record, "status", "-")
        return super().format(record)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    formatter = _JobFormatter(
        "%(asctime)s %(levelname)s job=%(job)s status=%(status)s target_date=%(target_date)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )
    formatter.converter = lambda *_: datetime.now(UTC).timetuple()  # timestamps en UTC
    handler.setFormatter(formatter)
    logger.handlers[:] = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False


def _log(level: int, status: str, target: date | str, message: str) -> None:
    logger.log(level, message, extra={"status": status, "target_date": str(target)})


# --- Entradas -----------------------------------------------------------------------------


def resolve_target_date(env: dict[str, str] | None = None, today: date | None = None) -> date:
    """TARGET_DATE (YYYY-MM-DD) o, por defecto, ayer en UTC."""
    raw = (env if env is not None else os.environ).get("TARGET_DATE", "").strip()
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError(f"TARGET_DATE debe tener el formato YYYY-MM-DD (recibido: {raw!r})") from exc
    return (today or datetime.now(UTC).date()) - timedelta(days=1)


def resolve_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    from dotenv import dotenv_values

    url = dotenv_values(API_DIR / ".env").get("DATABASE_URL")
    if url:
        return url
    from pipelines.db import database_url  # último recurso: Prefect Secret block

    return database_url()


def build_engine(url: str) -> Engine:
    from pipelines.db import build_engine as build

    return build(url)


def export_dir() -> Path:
    return Path(os.environ.get("NIGHTLY_EXPORT_DIR") or DEFAULT_EXPORT_DIR)


def csv_path(target: date, directory: Path | None = None) -> Path:
    return (directory or export_dir()) / f"telemetry_{target.isoformat()}.csv"


def pipeline_command(target: date) -> list[str]:
    """El pipeline del Hito 6 es semanal: se recalcula la semana (lunes, UTC) que contiene
    el día objetivo. El upsert del pipeline hace que repetirlo no duplique filas."""
    override = os.environ.get("NIGHTLY_PIPELINE_CMD")
    if override:
        return shlex.split(override)
    week = (target - timedelta(days=target.weekday())).isoformat()
    return [
        sys.executable, str(PIPELINE_SCRIPT),
        "--trigger", "scheduled", "--from-week", week, "--to-week", week,
    ]


# --- Trabajo ------------------------------------------------------------------------------


def export_telemetry_csv(engine: Engine, target: date, path: Path) -> int | None:
    """Exporta los eventos del día [target, target+1) UTC. Devuelve las filas escritas, o
    None si el CSV ya existía (no se reescribe). Se escribe en un archivo temporal y se
    renombra al final: un CSV a medias nunca cuenta como exportado."""
    if path.exists():
        return None
    from app.telemetry_store import TelemetryEventRecord as Event

    start = datetime.combine(target, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)
    query = (
        select(*(getattr(Event, column) for column in CSV_COLUMNS))
        .where(Event.timestamp >= start, Event.timestamp < end)
        .order_by(Event.timestamp, Event.id)
    )
    with engine.connect() as connection:
        frame = pd.DataFrame(connection.execute(query).all(), columns=CSV_COLUMNS)
    if not frame.empty:
        frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        frame["tags"] = frame["tags"].map(lambda tags: json.dumps(tags, ensure_ascii=False, sort_keys=True))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    frame.to_csv(tmp, index=False, encoding="utf-8")
    os.replace(tmp, path)
    return len(frame)


def run_pipeline(target: date, database_url: str) -> None:
    command = pipeline_command(target)
    env = {**os.environ, "DATABASE_URL": database_url, "PREFECT_SERVER_ANALYTICS_ENABLED": "false"}
    timeout = float(os.environ.get("NIGHTLY_PIPELINE_TIMEOUT", "1800"))
    result = subprocess.run(
        command, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=timeout, check=False
    )
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-5:]
        raise RuntimeError(f"el pipeline terminó con código {result.returncode}: {' | '.join(tail)}")


# --- Orquestación --------------------------------------------------------------------------


def _raise_on_sigterm(signum, _frame):  # pragma: no cover — se prueba con un proceso real
    raise SystemExit(128 + signum)


def main() -> int:
    configure_logging()
    try:
        target = resolve_target_date()
    except ValueError as exc:
        _log(logging.ERROR, job_runner.FAILED, os.environ.get("TARGET_DATE", "?"), str(exc))
        return 1

    database_url = resolve_database_url()
    engine = build_engine(database_url)
    job_runner.ensure_job_runs_table(engine)

    stale_hours = float(os.environ.get("JOB_STALE_AFTER_HOURS", "6"))
    for run_id in job_runner.fail_stale_runs(engine, JOB_NAME, timedelta(hours=stale_hours)):
        _log(logging.ERROR, job_runner.FAILED, target, f"ejecución huérfana {run_id} pasada a failed")

    if job_runner.has_completed_for_date(engine, JOB_NAME, target):
        _log(logging.INFO, "skipped_duplicate", target, "ya completado para este día: no se repite")
        return 0
    if job_runner.has_processing_lock(engine, JOB_NAME):
        _log(logging.INFO, "skipped_locked", target, "otra instancia está en processing: se aborta")
        return 0

    run_id = job_runner.create_run(engine, JOB_NAME, target)
    _log(logging.INFO, job_runner.PENDING, target, f"run_id={run_id} registrado")
    try:
        job_runner.mark_processing(engine, run_id)
    except job_runner.LockHeldError:
        # Dos instancias pasaron la comprobación a la vez; el índice único dejó entrar solo a la otra
        job_runner.discard_pending(engine, run_id)
        _log(logging.INFO, "skipped_locked", target, f"run_id={run_id} perdió el lock: se aborta")
        return 0

    signal.signal(signal.SIGTERM, _raise_on_sigterm)
    finished = False
    try:
        _log(logging.INFO, job_runner.PROCESSING, target, f"run_id={run_id} inicio")
        path = csv_path(target)
        rows = export_telemetry_csv(engine, target, path)
        if rows is None:
            _log(logging.INFO, job_runner.PROCESSING, target, f"{path.name} ya existe: no se reexporta")
        else:
            _log(logging.INFO, job_runner.PROCESSING, target, f"{rows} eventos exportados a {path}")
        run_pipeline(target, database_url)
        _log(logging.INFO, job_runner.PROCESSING, target, "pipeline terminado")
        job_runner.mark_completed(engine, run_id)
        finished = True
        _log(logging.INFO, job_runner.COMPLETED, target, f"run_id={run_id} fin")
        return 0
    except Exception as exc:
        job_runner.mark_failed(engine, run_id, f"{type(exc).__name__}: {exc}")
        finished = True
        logger.exception(
            "run_id=%s fallido", run_id, extra={"status": job_runner.FAILED, "target_date": str(target)}
        )
        return 1
    finally:
        # KeyboardInterrupt, SIGTERM (SystemExit)…: tampoco quedan filas en processing
        if not finished:
            job_runner.mark_failed(engine, run_id, "interrumpido antes de terminar")
            _log(logging.ERROR, job_runner.FAILED, target, f"run_id={run_id} interrumpido")


if __name__ == "__main__":
    sys.exit(main())
