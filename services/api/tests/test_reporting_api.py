"""Endpoints de reporting (Hito 6): consulta de KPIs, estado y disparo manual del pipeline."""
from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from pipelines import pipeline as pipeline_module
from pipelines.db import (
    ensure_reporting_tables,
    pipeline_runs,
    weekly_office_program_performance,
)

from app import database
from app.auth_models import Role

ROWS = [
    ("valencia", "ventas-b2b", date(2026, 11, 9), 185.0, 1, 1, 1, "EUR"),
    ("miami", "liderazgo-basico", date(2026, 11, 9), 300.0, 0, 0, 0, "USD"),
    ("valencia", "ventas-b2b", date(2026, 11, 2), 50.5, 4, 0, 0, "EUR"),
]


@pytest.fixture
def weekly_rows():
    ensure_reporting_tables(database.engine)
    keys = ["office", "programme_id", "week_start", "total_material_cost", "kits_delivered_count",
            "shortage_events_count", "cost_variance_events_count", "currency"]
    with database.engine.begin() as connection:
        connection.execute(
            weekly_office_program_performance.insert(),
            [{"id": uuid4(), "computed_at": datetime.now(UTC), **dict(zip(keys, row, strict=True))} for row in ROWS],
        )


def _run(status: str = "completed", **extra) -> dict:
    ensure_reporting_tables(database.engine)
    row = {
        "run_id": uuid4(),
        "pipeline": "weekly_office_program_performance",
        "trigger": "scheduled",
        "status": status,
        "started_at": datetime.now(UTC),
        "window_start": date(2026, 11, 2),
        "window_end": date(2026, 11, 15),
        "environment": "production",
        **extra,
    }
    with database.engine.begin() as connection:
        connection.execute(pipeline_runs.insert().values(**row))
    return row


def test_requires_token(client):
    for path in ("/reporting/weekly-office-program-performance", "/reporting/pipeline-runs/latest"):
        assert client.get(path).status_code == 401
    assert client.post("/reporting/pipeline-runs").status_code == 401


def test_weekly_performance_empty(client, auth_headers):
    res = client.get("/reporting/weekly-office-program-performance", headers=auth_headers)
    assert res.json() == {"week_start": None, "entries": []}


def test_weekly_performance_defaults_to_latest_week(client, auth_headers, weekly_rows):
    data = client.get("/reporting/weekly-office-program-performance", headers=auth_headers).json()
    assert data["week_start"] == "2026-11-09"
    # Contrato del BRIEFING §6: una entrada por oficina/programa, monedas sin mezclar
    assert data["entries"] == [
        {"office": "miami", "programme_id": "liderazgo-basico", "total_material_cost": 300.0,
         "kits_delivered_count": 0, "shortage_events_count": 0, "cost_variance_events_count": 0, "currency": "USD"},
        {"office": "valencia", "programme_id": "ventas-b2b", "total_material_cost": 185.0,
         "kits_delivered_count": 1, "shortage_events_count": 1, "cost_variance_events_count": 1, "currency": "EUR"},
    ]


def test_weekly_performance_for_a_given_week(client, auth_headers, weekly_rows):
    data = client.get(
        "/reporting/weekly-office-program-performance", params={"week_start": "2026-11-02"}, headers=auth_headers
    ).json()
    assert data["week_start"] == "2026-11-02"
    assert [e["kits_delivered_count"] for e in data["entries"]] == [4]


def test_week_start_must_be_monday(client, auth_headers):
    res = client.get(
        "/reporting/weekly-office-program-performance", params={"week_start": "2026-11-04"}, headers=auth_headers
    )
    assert res.status_code == 422


def test_weeks_list(client, auth_headers, weekly_rows):
    assert client.get("/reporting/weeks", headers=auth_headers).json() == ["2026-11-09", "2026-11-02"]


def test_latest_run(client, auth_headers):
    assert client.get("/reporting/pipeline-runs/latest", headers=auth_headers).status_code == 404
    run = _run(status="completed", rows_upserted=2, events_extracted=6, events_discarded=0)
    data = client.get("/reporting/pipeline-runs/latest", headers=auth_headers).json()
    assert data["run_id"] == str(run["run_id"])
    assert data["status"] == "completed"
    assert data["rows_upserted"] == 2


@pytest.fixture
def admin_headers(client, auth_headers):
    user = database.users_table.all()[0]
    database.users_table.update({"role": Role.ADMIN.value}, doc_ids=[user.doc_id])
    return auth_headers


def test_manual_trigger_enqueues_the_flow(client, admin_headers, monkeypatch):
    calls = []
    monkeypatch.setattr(
        pipeline_module, "weekly_office_program_performance",
        lambda trigger, run_id: calls.append((trigger, run_id)) or {"run_id": str(run_id)},
    )
    res = client.post("/reporting/pipeline-runs", headers=admin_headers)
    assert res.status_code == 202
    body = res.json()
    assert body["status"] == "pending" and body["task_id"]
    assert [(t, str(r)) for t, r in calls] == [("manual", body["run_id"])]


def test_manual_trigger_conflict_when_running(client, admin_headers):
    _run(status="running")
    assert client.post("/reporting/pipeline-runs", headers=admin_headers).status_code == 409


def test_manual_trigger_forbidden_for_basic_user(client, auth_headers):
    assert client.post("/reporting/pipeline-runs", headers=auth_headers).status_code == 403


def test_manual_trigger_503_when_the_queue_is_down(client, admin_headers, monkeypatch):
    from kombu.exceptions import OperationalError

    from app.tasks.reporting import run_weekly_pipeline

    def down(*_args, **_kwargs):
        raise OperationalError("Error 111 connecting to localhost:6379")

    monkeypatch.setattr(run_weekly_pipeline, "apply_async", down)
    res = client.post("/reporting/pipeline-runs", headers=admin_headers)
    assert res.status_code == 503


def test_telemetry_report_still_separate(client, auth_headers):
    """El reporte técnico sigue igual y no ve las tablas de reporting."""
    data = client.get("/telemetry/report", headers=auth_headers).json()
    assert "weekly_office_program_performance" not in str(data)
