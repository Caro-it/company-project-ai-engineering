"""Pipeline de análisis (app/telemetry/analysis.py) y GET /telemetry/report."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import database
from app.telemetry import analysis
from app.telemetry.report import ReportCache, resolve_period
from app.telemetry_models import TelemetryEvent
from app.telemetry_store import store_events

START = datetime(2026, 11, 16, tzinfo=UTC)
END = datetime(2026, 11, 18, tzinfo=UTC)
SESSION_A = str(uuid.uuid4())
SESSION_B = str(uuid.uuid4())


def _event(event_type: str, when: str, session: str = SESSION_A, **properties) -> TelemetryEvent:
    return TelemetryEvent.model_validate(
        {
            "eventId": str(uuid.uuid4()),
            "timestamp": when,
            "sessionId": session,
            "userId": None,
            "event_type": event_type,
            "schemaVersion": "1.0.0",
            "requestId": None,
            "source": "backoffice",
            "environment": "development",
            "properties": properties,
        }
    )


PAGE = {"page": "/inventory/products", "app": "backoffice", "ui_locale": "es"}
ERROR = {"page": "/inventory/products", "app": "backoffice", "error_name": "TypeError",
         "message": "x", "source": "onerror", "fingerprint": "0123456789ab"}


@pytest.fixture
def seeded():
    events = [
        # 16/11: 3 page_viewed, 1 error, 1 login ok, 1 login ko
        _event("page_viewed", "2026-11-16T09:00:00Z", **PAGE),
        _event("page_viewed", "2026-11-16T10:00:00Z", **PAGE),
        _event("page_viewed", "2026-11-16T23:59:59Z", **PAGE),
        _event("frontend_error_captured", "2026-11-16T11:00:00Z", **ERROR),
        _event("login_succeeded", "2026-11-16T08:00:00Z", user_role="admin"),
        _event("login_failed", "2026-11-16T07:59:00Z", reason="invalid_credentials"),
        # 17/11: carga de páginas, fallos de red, el mismo error en otra sesión, 3 logins ko
        _event("page_load_recorded", "2026-11-17T09:00:00Z", page="/", app="backoffice", lcp_ms=1000, device_type="desktop"),
        _event("page_load_recorded", "2026-11-17T09:05:00Z", page="/", app="backoffice", lcp_ms=2000, device_type="desktop"),
        _event("page_load_recorded", "2026-11-17T09:06:00Z", page="/", app="backoffice", lcp_ms=3000, device_type="mobile"),
        _event("api_request_failed", "2026-11-17T12:00:00Z", route="/inventory/products", http_method="GET", failure_type="network", elapsed_ms=100),
        _event("api_request_failed", "2026-11-17T12:30:00Z", route="/inventory/products", http_method="GET", failure_type="network", elapsed_ms=300),
        _event("frontend_error_captured", "2026-11-17T13:00:00Z", session=SESSION_B, **ERROR),
        *[_event("login_failed", f"2026-11-17T08:0{i}:00Z", reason="invalid_credentials") for i in range(3)],
        # fuera de la ventana [16/11, 18/11): no cuentan
        _event("page_viewed", "2026-11-15T23:59:59Z", **PAGE),
        _event("page_viewed", "2026-11-18T00:00:00Z", **PAGE),
    ]
    with Session(database.engine) as session:
        store_events(session, events)


def test_events_per_day_respects_window(seeded):
    rows = analysis.events_per_day(database.engine, START, END)
    by_key = {(r["day"], r["event_type"]): r["events"] for r in rows}
    assert by_key[("2026-11-16", "page_viewed")] == 3  # 23:59:59 cuenta en su día UTC
    assert ("2026-11-15", "page_viewed") not in by_key  # inicio inclusivo
    assert ("2026-11-18", "page_viewed") not in by_key  # fin exclusivo
    assert sum(by_key.values()) == 15


def test_error_rate_by_day(seeded):
    rows = {r["day"]: r for r in analysis.error_rate_by_day(database.engine, START, END)}
    assert rows["2026-11-16"]["events"] == 6
    assert rows["2026-11-16"]["errors"] == 1
    assert rows["2026-11-16"]["error_rate"] == round(1 / 6, 4)
    # 17/11: 1 error; avisos: 2 api_request_failed + 3 login_failed
    assert rows["2026-11-17"]["warnings"] == 5


def test_page_load_by_day(seeded):
    [row] = analysis.page_load_by_day(database.engine, START, END)
    assert row == {"day": "2026-11-17", "page": "/", "samples": 3, "lcp_median_ms": 2000.0, "lcp_p75_ms": 2500.0}


def test_auth_failure_rate(seeded):
    rows = {r["day"]: r for r in analysis.auth_failure_rate(database.engine, START, END)}
    assert rows["2026-11-16"] == {"day": "2026-11-16", "attempts": 2, "failed": 1, "failure_rate": 0.5}
    assert rows["2026-11-17"]["failure_rate"] == 1.0


def test_request_failures_by_route(seeded):
    [row] = analysis.request_failures_by_route(database.engine, START, END)
    assert row == {"day": "2026-11-17", "route": "/inventory/products", "failure_type": "network",
                   "failures": 2, "avg_elapsed_ms": 200.0}


def test_frontend_errors_by_fingerprint(seeded):
    [row] = analysis.frontend_errors_by_fingerprint(database.engine, START, END)
    assert row["fingerprint"] == "0123456789ab"
    assert row["occurrences"] == 2
    assert row["sessions"] == 2
    assert row["last_seen"] == "2026-11-17T13:00:00Z"


def test_metrics_are_pure(seeded):
    assert analysis.build_report(database.engine, START, END) == analysis.build_report(database.engine, START, END)


def test_empty_window_returns_empty_lists(seeded):
    report = analysis.build_report(database.engine, datetime(2020, 1, 1, tzinfo=UTC), datetime(2020, 1, 2, tzinfo=UTC))
    assert all(value == [] for value in report.values())


# --- Endpoint -------------------------------------------------------------------------------


def test_report_requires_token(client: TestClient):
    assert client.get("/telemetry/report").status_code == 401


def test_report_structure(client, auth_headers, seeded):
    res = client.get(
        "/telemetry/report",
        params={"start_date": "2026-11-16T00:00:00Z", "end_date": "2026-11-18T00:00:00Z"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["period"] == {"from": "2026-11-16T00:00:00Z", "to": "2026-11-18T00:00:00Z"}
    assert set(data["metrics"]) == set(analysis.METRICS)
    assert data["metrics"]["auth_failure_rate"][0]["day"] == "2026-11-16"


def test_report_defaults_to_last_seven_days(client, auth_headers):
    data = client.get("/telemetry/report", headers=auth_headers).json()
    start = datetime.fromisoformat(data["period"]["from"])
    end = datetime.fromisoformat(data["period"]["to"])
    assert end - start == timedelta(days=7)
    assert abs(datetime.now(UTC) - end) < timedelta(minutes=2)


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2026-11-18T00:00:00Z", "end_date": "2026-11-16T00:00:00Z"},
        {"start_date": "2026-01-01T00:00:00Z", "end_date": "2026-11-16T00:00:00Z"},
        {"start_date": "ayer"},
    ],
)
def test_invalid_period_is_422(client, auth_headers, params):
    assert client.get("/telemetry/report", params=params, headers=auth_headers).status_code == 422


def test_report_is_cached_for_the_same_period(client, auth_headers, monkeypatch):
    calls = []
    real = analysis.build_report

    def counting(*args):
        calls.append(args)
        return real(*args)

    monkeypatch.setattr("app.routers.telemetry.build_report", counting)
    params = {"start_date": "2026-11-16T00:00:00Z", "end_date": "2026-11-18T00:00:00Z"}
    client.get("/telemetry/report", params=params, headers=auth_headers)
    client.get("/telemetry/report", params=params, headers=auth_headers)
    assert len(calls) == 1
    client.get("/telemetry/report", params={**params, "end_date": "2026-11-17T00:00:00Z"}, headers=auth_headers)
    assert len(calls) == 2


# --- Período y caché ----------------------------------------------------------------------


def test_resolve_period_rounds_now_and_assumes_utc():
    now = datetime(2026, 11, 18, 21, 30, 45, 123, tzinfo=UTC)
    start, end = resolve_period(None, None, now=now)
    assert end == datetime(2026, 11, 18, 21, 30, tzinfo=UTC)
    assert end - start == timedelta(days=7)
    naive_start, _ = resolve_period(datetime(2026, 11, 10), None, now=now)  # noqa: DTZ001 (fecha sin zona a propósito)
    assert naive_start.tzinfo is UTC


def test_report_cache_expires_after_ttl():
    clock = [0.0]
    cache = ReportCache(ttl_seconds=60, clock=lambda: clock[0])
    key = (START, END)
    values = iter([{"v": 1}, {"v": 2}])
    assert cache.get_or_compute(key, lambda: next(values)) == {"v": 1}
    clock[0] = 59
    assert cache.get_or_compute(key, lambda: next(values)) == {"v": 1}
    clock[0] = 61
    assert cache.get_or_compute(key, lambda: next(values)) == {"v": 2}
