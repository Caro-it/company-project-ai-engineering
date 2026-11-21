"""Pipeline de Desempeño de Negocio de Nexova (Hito 6, parte 2/3) — orquestado con Prefect.

Produce el "Reporte Semanal de Desempeño por Oficina y Programa" (Laura y Elena) en
reporting.weekly_office_program_performance a partir de public.telemetry_events (solo lectura).
Diseño: data/pipelines/PIPELINE_DESIGN.md · BRIEFING: docs/CONTEXT-data-pipelines-nexova.md

Ejecución (desde la raíz del monorepo, con el entorno de services/api):
    uv run --project services/api python data/pipelines/pipeline.py
    uv run --project services/api python data/pipelines/pipeline.py --from-week 2026-11-02 --to-week 2026-11-16
Frecuencia prevista: lunes 06:00 Europe/Madrid (deployment de Prefect, cron "0 6 * * 1").
"""
import argparse
import hashlib
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

if __package__ in (None, ""):  # ejecutado como script: data/ al path para importar pipelines/process
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from prefect import flow, task
from prefect.runtime import flow_run
from process.weekly_performance import (
    KPI_EVENT_TYPES,
    clean_material_events,
    compute_weekly_office_program_kpis,
    flatten_material_events,
)
from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from pipelines.db import (
    REPO_ROOT,
    ensure_reporting_tables,
    get_engine,
    pipeline_environment,
    pipeline_runs,
    telemetry_events,
)
from pipelines.db import (
    weekly_office_program_performance as performance_table,
)
from pipelines.queries import PIPELINE_NAME

# Semanas que se recalculan en cada ejecución programada: la anterior y, como margen para
# eventos tardíos, la previa (PIPELINE_DESIGN.md §6)
LOOKBACK_WEEKS = 2
# Clave del pg_advisory_xact_lock que serializa las cargas de este pipeline
ADVISORY_LOCK_KEY = 6_000_001
SNAPSHOT_DIR = REPO_ROOT / "data" / "eval" / "weekly_office_program_performance"


def monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def resolve_window(
    trigger: str, from_week: date | None, to_week: date | None, today: date | None = None
) -> tuple[date, date]:
    """[window_start, window_end) en semanas completas (lunes, UTC).

    - Programada: las LOOKBACK_WEEKS semanas cerradas anteriores a la actual.
    - Manual: lo mismo más la semana en curso (para ver cómo va).
    - Con --from-week/--to-week (backfill): esas semanas, ambas incluidas.
    """
    current = monday(today or datetime.now(UTC).date())
    start = monday(from_week) if from_week else current - timedelta(weeks=LOOKBACK_WEEKS)
    if to_week:
        end = monday(to_week) + timedelta(weeks=1)
    else:
        end = current + timedelta(weeks=1) if trigger == "manual" else current
    if start >= end:
        raise ValueError("from_week debe ser anterior o igual a to_week")
    return start, end


def _as_datetime(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


# --- Tasks ------------------------------------------------------------------------------------


# 3 reintentos con espera creciente: los fallos de red con Supabase (pooler, timeouts) suelen
# resolverse en segundos; más reintentos solo retrasarían el aviso de un fallo real
@task(name="extract_material_events", retries=3, retry_delay_seconds=[10, 30, 60])
def extract_material_events(window_start: date, window_end: date, environment: str) -> pd.DataFrame:
    """Solo los 4 event_type del BRIEFING, solo la ventana y solo el entorno pedido (en SQL)."""
    env = telemetry_events.c.tags[("_envelope", "environment")].as_string()
    query = select(telemetry_events.c.timestamp, telemetry_events.c.event_type, telemetry_events.c.tags).where(
        telemetry_events.c.event_type.in_(KPI_EVENT_TYPES),
        telemetry_events.c.timestamp >= _as_datetime(window_start),
        telemetry_events.c.timestamp < _as_datetime(window_end),
        env == environment,
    )
    with get_engine().connect() as connection:
        rows = connection.execute(query).mappings().all()
    return pd.DataFrame(rows, columns=["timestamp", "event_type", "tags"])


def _events_cache_key(_context, parameters: dict) -> str:
    """La clave es el contenido de la entrada: los event_id y sus event_type. Si los eventos de
    la ventana son los mismos, los KPIs también."""
    raw: pd.DataFrame = parameters["raw_events"]
    if raw.empty:
        return "weekly-kpis-empty"
    ids = flatten_material_events(raw)[["event_id", "event_type"]].astype(str)
    digest = hashlib.sha256("|".join(sorted(ids["event_id"] + ":" + ids["event_type"])).encode()).hexdigest()
    return f"weekly-kpis-{digest}"


# Caché de 1 h: un reintento del flow (p. ej. tras fallar la carga) no vuelve a transformar los
# mismos eventos. Una hora basta para cubrir reintentos y no deja resultados viejos
# para la ejecución de la semana siguiente
@task(
    name="compute_weekly_office_program_kpis",
    cache_key_fn=_events_cache_key,
    cache_expiration=timedelta(hours=1),
)
def compute_weekly_office_program_kpis_task(raw_events: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    events, discarded = clean_material_events(flatten_material_events(raw_events))
    return compute_weekly_office_program_kpis(events), discarded


# 2 reintentos: la carga es una única transacción con upsert, así que repetirla es seguro
@task(name="load_weekly_office_program_performance", retries=2, retry_delay_seconds=15)
def load_weekly_office_program_performance(kpis: pd.DataFrame) -> int:
    """Upsert por (office, programme_id, week_start) en UNA transacción (idempotente)."""
    if kpis.empty:
        return 0
    engine = get_engine()
    now = datetime.now(UTC)
    rows = [{**row, "id": uuid4(), "computed_at": now} for row in kpis.to_dict(orient="records")]
    table = performance_table
    insert_fn = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    statement = insert_fn(table).values(rows)
    statement = statement.on_conflict_do_update(
        index_elements=["office", "programme_id", "week_start"],
        set_={
            "total_material_cost": statement.excluded.total_material_cost,
            "kits_delivered_count": statement.excluded.kits_delivered_count,
            "shortage_events_count": statement.excluded.shortage_events_count,
            "cost_variance_events_count": statement.excluded.cost_variance_events_count,
            "currency": statement.excluded.currency,
            "computed_at": statement.excluded.computed_at,
        },
    )
    with engine.begin() as connection:
        if engine.dialect.name == "postgresql":
            # Una sola carga a la vez (cron + "Ejecutar ahora"): la segunda espera
            connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ADVISORY_LOCK_KEY})
        connection.execute(statement)
    return len(rows)


@task(name="record_pipeline_run", retries=2, retry_delay_seconds=5)
def record_pipeline_run(run_id: UUID, values: dict, create: bool = False) -> None:
    """Abre (create=True) o actualiza la fila de reporting.pipeline_runs."""
    with get_engine().begin() as connection:
        if create:
            connection.execute(pipeline_runs.insert().values(run_id=run_id, pipeline=PIPELINE_NAME, **values))
        else:
            connection.execute(update(pipeline_runs).where(pipeline_runs.c.run_id == run_id).values(**values))


@task(name="export_weekly_snapshot")
def export_weekly_snapshot(kpis: pd.DataFrame, run_id: UUID) -> str:
    """Paso opcional: copia CSV del resultado en data/eval/ para revisarlo o compararlo."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / f"{run_id}.csv"
    kpis.to_csv(path, index=False)
    return str(path)


# --- Flow -------------------------------------------------------------------------------------


@flow(name="weekly_office_program_performance", log_prints=True)
def weekly_office_program_performance(
    trigger: str = "scheduled",
    from_week: date | None = None,
    to_week: date | None = None,
    environment: str | None = None,
    run_id: UUID | None = None,
) -> dict:
    """Extracción → transformación → carga, con el log de la ejecución en pipeline_runs."""
    engine = get_engine()
    ensure_reporting_tables(engine)
    run_id = run_id or uuid4()
    environment = environment or pipeline_environment()
    window_start, window_end = resolve_window(trigger, from_week, to_week)
    record_pipeline_run(
        run_id,
        {
            "flow_run_id": str(flow_run.id) if flow_run.id else None,
            "trigger": trigger,
            "status": "running",
            "started_at": datetime.now(UTC),
            "window_start": window_start,
            "window_end": window_end - timedelta(days=1),
            "environment": environment,
        },
        create=True,
    )

    def fail(phase: str, state):
        # Fallo manejado explícitamente: se registra en pipeline_runs antes de terminar en Failed
        error = state.message or "error"
        try:
            state.result()
        except Exception as exc:  # noqa: BLE001
            error = f"{type(exc).__name__}: {exc}"
        record_pipeline_run(
            run_id,
            {"status": "failed", "finished_at": datetime.now(UTC), "failed_phase": phase, "error_message": error[:500]},
        )
        print(f"Pipeline {run_id} fallido en la fase {phase}: {error}")
        return state

    extract_state = extract_material_events(window_start, window_end, environment, return_state=True)
    if extract_state.is_failed():
        return fail("extract", extract_state)
    raw_events = extract_state.result()

    transform_state = compute_weekly_office_program_kpis_task(raw_events, return_state=True)
    if transform_state.is_failed():
        return fail("transform", transform_state)
    kpis, discarded = transform_state.result()

    load_state = load_weekly_office_program_performance(kpis, return_state=True)
    if load_state.is_failed():
        return fail("load", load_state)
    rows_upserted = load_state.result()

    # Opcional: si la copia en data/eval falla, la ejecución sigue y se completa igual
    snapshot = export_weekly_snapshot(kpis, run_id, return_state=True)
    if snapshot.is_failed():
        print(f"Aviso: no se pudo guardar la copia CSV ({snapshot.message})")

    summary = {
        "run_id": str(run_id),
        "window_start": window_start.isoformat(),
        "window_end": (window_end - timedelta(days=1)).isoformat(),
        "environment": environment,
        "events_extracted": len(raw_events),
        "events_discarded": discarded,
        "rows_upserted": rows_upserted,
    }
    record_pipeline_run(
        run_id,
        {
            "status": "completed",
            "finished_at": datetime.now(UTC),
            "events_extracted": len(raw_events),
            "events_discarded": discarded,
            "rows_upserted": rows_upserted,
        },
    )
    print(f"Pipeline completado: {summary}")
    return summary


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reporte Semanal de Desempeño por Oficina y Programa")
    parser.add_argument("--from-week", type=date.fromisoformat, help="lunes inicial (YYYY-MM-DD), incluido")
    parser.add_argument("--to-week", type=date.fromisoformat, help="lunes final (YYYY-MM-DD), incluido")
    parser.add_argument("--trigger", choices=["scheduled", "manual", "backfill"], default=None)
    parser.add_argument("--environment", choices=["production", "development"], default=None)
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    trigger = args.trigger or ("backfill" if args.from_week or args.to_week else "manual")
    result = weekly_office_program_performance(
        trigger=trigger, from_week=args.from_week, to_week=args.to_week, environment=args.environment
    )
    print(result)
