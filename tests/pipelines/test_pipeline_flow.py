"""Integración del flow de Prefect con SQLite en memoria (Hito 6, parte 2).

Ejecutar desde la raíz del monorepo:
    uv run --project services/api python -m pytest tests/pipelines
"""
import uuid
from datetime import UTC, date, datetime

import pytest
from pipelines import db, pipeline
from pipelines.db import (
    pipeline_runs,
    telemetry_events,
    weekly_office_program_performance,
)
from prefect.testing.utilities import prefect_test_harness
from sqlalchemy import select

WEEK = date(2026, 11, 9)


@pytest.fixture(scope="module", autouse=True)
def prefect_server():
    with prefect_test_harness():
        yield


@pytest.fixture
def engine(tmp_path):
    engine = db.build_engine(f"sqlite:///{tmp_path / 'pipeline.db'}")
    telemetry_events.metadata.create_all(engine)
    db.configure_engine(engine)
    yield engine
    db.configure_engine(None)


def _event(event_type: str, day: int, environment: str = "development", **tags) -> dict:
    return {
        "timestamp": datetime(2026, 11, day, 10, tzinfo=UTC),
        "event_type": event_type,
        "tags": {**tags, "_envelope": {"event_id": str(uuid.uuid4()), "environment": environment}},
    }


def _seed(engine, events: list[dict]) -> None:
    with engine.begin() as connection:
        connection.execute(telemetry_events.insert(), events)


def _rows(engine) -> list[dict]:
    with engine.connect() as connection:
        return [dict(r) for r in connection.execute(select(weekly_office_program_performance)).mappings()]


def test_flow_computes_and_upserts_idempotently(engine):
    _seed(
        engine,
        [
            _event("inbound_order_created", 10, office="valencia", programme_id="ventas-b2b", total_cost=125.0),
            _event("outbound_order_created", 11, office="valencia", programme_id="ventas-b2b"),
            _event("stock_threshold_triggered", 11, office="valencia", programme_id="ventas-b2b"),
            _event("page_viewed", 11, page="/"),  # fuera de los 4 del BRIEFING
            _event("outbound_order_created", 11, "production", office="valencia", programme_id="ventas-b2b"),
        ],
    )
    first = pipeline.weekly_office_program_performance(trigger="backfill", from_week=WEEK, to_week=WEEK)
    second = pipeline.weekly_office_program_performance(trigger="backfill", from_week=WEEK, to_week=WEEK)

    assert first["events_extracted"] == 3  # solo development y solo los 4 event_type
    rows = _rows(engine)
    assert len(rows) == 1  # dos ejecuciones, una sola fila
    row = rows[0]
    assert (row["office"], row["programme_id"], row["week_start"]) == ("valencia", "ventas-b2b", WEEK)
    assert float(row["total_material_cost"]) == 125.0
    assert row["kits_delivered_count"] == 1
    assert row["shortage_events_count"] == 1
    assert row["currency"] == "EUR"
    assert second["rows_upserted"] == 1

    with engine.connect() as connection:
        runs = connection.execute(select(pipeline_runs.c.status, pipeline_runs.c.rows_upserted)).all()
    assert [tuple(r) for r in runs] == [("completed", 1), ("completed", 1)]


def test_late_event_updates_the_published_week(engine):
    _seed(engine, [_event("outbound_order_created", 10, office="miami", programme_id="liderazgo-basico")])
    pipeline.weekly_office_program_performance(trigger="backfill", from_week=WEEK, to_week=WEEK)
    _seed(engine, [_event("outbound_order_created", 12, office="miami", programme_id="liderazgo-basico")])
    pipeline.weekly_office_program_performance(trigger="backfill", from_week=WEEK, to_week=WEEK)
    [row] = _rows(engine)
    assert row["kits_delivered_count"] == 2
    assert row["currency"] == "USD"


def test_failed_load_is_recorded_and_flow_fails(engine, monkeypatch):
    _seed(engine, [_event("outbound_order_created", 10, office="valencia", programme_id="ventas-b2b")])

    def broken(_kpis):
        raise ConnectionError("Supabase timeout")

    monkeypatch.setattr(pipeline.load_weekly_office_program_performance, "fn", broken)
    monkeypatch.setattr(pipeline.load_weekly_office_program_performance, "retries", 0)
    state = pipeline.weekly_office_program_performance(
        trigger="backfill", from_week=WEEK, to_week=WEEK, return_state=True
    )
    assert state.is_failed()
    with engine.connect() as connection:
        run = connection.execute(select(pipeline_runs)).mappings().one()
    assert run["status"] == "failed"
    assert run["failed_phase"] == "load"
    assert "Supabase timeout" in run["error_message"]
    assert _rows(engine) == []


def test_optional_snapshot_failure_does_not_stop_the_flow(engine, monkeypatch):
    _seed(engine, [_event("outbound_order_created", 10, office="valencia", programme_id="ventas-b2b")])

    def broken(*_args):
        raise PermissionError("data/eval no se puede escribir")

    monkeypatch.setattr(pipeline.export_weekly_snapshot, "fn", broken)
    summary = pipeline.weekly_office_program_performance(trigger="backfill", from_week=WEEK, to_week=WEEK)
    assert summary["rows_upserted"] == 1


def test_resolve_window():
    today = date(2026, 11, 18)  # miércoles
    assert pipeline.resolve_window("scheduled", None, None, today) == (date(2026, 11, 2), date(2026, 11, 16))
    assert pipeline.resolve_window("manual", None, None, today) == (date(2026, 11, 2), date(2026, 11, 23))
    assert pipeline.resolve_window("backfill", date(2026, 11, 5), date(2026, 11, 9), today) == (
        date(2026, 11, 2),
        date(2026, 11, 16),
    )
    with pytest.raises(ValueError):
        pipeline.resolve_window("backfill", date(2026, 11, 16), date(2026, 11, 2), today)
