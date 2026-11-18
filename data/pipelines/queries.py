"""Lecturas de las tablas `reporting` para la API (services importa de aquí).

Devuelven el contrato del BRIEFING §6 (docs/CONTEXT-data-pipelines-nexova.md).
"""
from datetime import date

from sqlalchemy import Engine, func, select

from pipelines.db import (
    ensure_reporting_tables,
    pipeline_runs,
    weekly_office_program_performance,
)

W = weekly_office_program_performance
PIPELINE_NAME = "weekly_office_program_performance"


def get_weekly_performance(engine: Engine, week_start: date | None = None) -> dict:
    """Todas las combinaciones oficina/programa de una semana (por defecto la más reciente)."""
    ensure_reporting_tables(engine)
    with engine.connect() as connection:
        if week_start is None:
            week_start = connection.execute(select(func.max(W.c.week_start))).scalar()
        if week_start is None:
            return {"week_start": None, "entries": []}
        rows = connection.execute(
            select(
                W.c.office,
                W.c.programme_id,
                W.c.total_material_cost,
                W.c.kits_delivered_count,
                W.c.shortage_events_count,
                W.c.cost_variance_events_count,
                W.c.currency,
            )
            .where(W.c.week_start == week_start)
            .order_by(W.c.office, W.c.programme_id)
        ).mappings()
        entries = [{**row, "total_material_cost": float(row["total_material_cost"])} for row in rows]
    return {"week_start": week_start.isoformat(), "entries": entries}


def list_weeks(engine: Engine, limit: int = 12) -> list[str]:
    """Semanas calculadas, de la más reciente a la más antigua (selector del dashboard)."""
    ensure_reporting_tables(engine)
    with engine.connect() as connection:
        weeks = connection.execute(
            select(W.c.week_start).distinct().order_by(W.c.week_start.desc()).limit(limit)
        ).scalars()
        return [week.isoformat() for week in weeks]


def get_latest_run(engine: Engine) -> dict | None:
    ensure_reporting_tables(engine)
    with engine.connect() as connection:
        row = (
            connection.execute(
                select(pipeline_runs)
                .where(pipeline_runs.c.pipeline == PIPELINE_NAME)
                .order_by(pipeline_runs.c.started_at.desc())
                .limit(1)
            )
            .mappings()
            .first()
        )
    if row is None:
        return None
    data = dict(row)
    data["run_id"] = str(data["run_id"])
    for key in ("started_at", "finished_at"):
        if data[key] is not None:
            data[key] = data[key].isoformat()
    for key in ("window_start", "window_end"):
        data[key] = data[key].isoformat()
    return data


def has_running_run(engine: Engine) -> bool:
    ensure_reporting_tables(engine)
    with engine.connect() as connection:
        return (
            connection.execute(
                select(func.count())
                .select_from(pipeline_runs)
                .where(pipeline_runs.c.pipeline == PIPELINE_NAME, pipeline_runs.c.status == "running")
            ).scalar()
            > 0
        )
