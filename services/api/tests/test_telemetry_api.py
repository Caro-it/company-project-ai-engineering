# ruff: noqa: F811  (fixtures importadas de test_inventory_api)
"""Stub POST /telemetry/events (proyecto de captura) y campos de inventario para telemetría."""
import json
import uuid

import pytest
from sqlalchemy import event as sa_event
from sqlmodel import Session, select
from test_inventory_api import LAPTOP, create_asset, inbound, outbound  # noqa: F401

from app import database
from app.telemetry_store import TelemetryEventRecord


def _event(**overrides) -> dict:
    event = {
        "eventId": str(uuid.uuid4()),
        "timestamp": "2026-11-18T19:30:05.123Z",
        "sessionId": str(uuid.uuid4()),
        "userId": str(uuid.uuid4()),
        "event_type": "page_viewed",
        "schemaVersion": "1.0.0",
        "requestId": None,
        "source": "backoffice",
        "environment": "development",
        "properties": {"page": "/inventory/products", "app": "backoffice", "ui_locale": "es"},
    }
    event.update(overrides)
    return event


# --- Receptor real: validación por evento y bulk insert -------------------------------


def _rows(event_type: str | None = None) -> list[TelemetryEventRecord]:
    with Session(database.engine) as session:
        query = select(TelemetryEventRecord)
        if event_type:
            query = query.where(TelemetryEventRecord.event_type == event_type)
        return list(session.exec(query).all())


INBOUND = {
    "office": "valencia",
    "product_id": "7",
    "product_category": "training_kit",
    "programme_id": "ventas-b2b",
    "quantity": 10,
    "currency": "EUR",
    "order_id": "31",
    "supplier_id": "imprenta-turia-sl",
    "unit_cost": 12.5,
    "total_cost": 125,
    "stock_after": 16,
}


def test_batch_is_stored_without_token(client):
    events = [_event(), _event(event_type="inbound_order_created", properties=INBOUND)]
    res = client.post("/telemetry/events", json={"events": events})
    assert res.status_code == 200
    assert res.json() == {"received": 2, "stored": 2, "rejected": 0}

    row = _rows("inbound_order_created")[0]
    assert row.service == "backoffice"
    assert row.level == "info"
    assert float(row.value) == 10  # quantity
    assert row.message.startswith("inbound_order_created · office=valencia · programme_id=ventas-b2b")
    assert row.tags["programme_id"] == "ventas-b2b"
    assert row.tags["_envelope"]["event_id"] == events[1]["eventId"]
    assert row.tags["_envelope"]["schema_version"] == "1.0.0"
    assert row.timestamp is not None


def test_mixed_batch_keeps_the_valid_events(client):
    bad_envelope = _event(eventId="no-es-uuid")
    bad_properties = _event(properties={**_event()["properties"], "email": "ana@nexova.com"})
    unknown_type = _event(event_type="something_happened")
    events = [_event(), bad_envelope, bad_properties, unknown_type, _event(), "no soy un objeto"]
    res = client.post("/telemetry/events", json={"events": events})
    assert res.status_code == 200
    assert res.json() == {"received": 6, "stored": 2, "rejected": 4}
    assert len(_rows()) == 2
    assert all("ana@nexova.com" not in str(row.tags) for row in _rows())


def test_text_plain_body_from_send_beacon_is_accepted(client):
    """sendBeacon envía un Blob text/plain para evitar el preflight CORS."""
    body = json.dumps({"events": [_event()]})
    res = client.post("/telemetry/events", content=body, headers={"Content-Type": "text/plain;charset=UTF-8"})
    assert res.json() == {"received": 1, "stored": 1, "rejected": 0}


def test_bulk_insert_is_one_statement(client):
    """Un solo INSERT por lote, no uno por evento."""
    inserts = []

    def count(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("INSERT INTO TELEMETRY_EVENTS"):
            inserts.append(statement)

    sa_event.listen(database.engine, "before_cursor_execute", count)
    try:
        res = client.post("/telemetry/events", json={"events": [_event() for _ in range(20)]})
    finally:
        sa_event.remove(database.engine, "before_cursor_execute", count)
    assert res.json()["stored"] == 20
    assert len(_rows()) == 20
    assert len(inserts) == 1


def test_retried_events_are_not_duplicated(client):
    events = [_event(), _event()]
    client.post("/telemetry/events", json={"events": events})
    res = client.post("/telemetry/events", json={"events": [*events, events[0]]})
    assert res.json() == {"received": 3, "stored": 3, "rejected": 0}  # idempotente
    assert len(_rows()) == 2


@pytest.mark.parametrize(
    ("event_type", "properties", "level", "value"),
    [
        ("frontend_error_captured", {"page": "/", "app": "backoffice", "error_name": "TypeError",
                                     "message": "x", "source": "onerror", "fingerprint": "0123456789ab"}, "error", None),
        ("login_failed", {"reason": "invalid_credentials"}, "warn", None),
        ("page_load_recorded", {"page": "/", "app": "backoffice", "lcp_ms": 812.0, "device_type": "desktop"}, "info", 812.0),
    ],
)
def test_level_and_value_mapping(client, event_type, properties, level, value):
    client.post("/telemetry/events", json={"events": [_event(event_type=event_type, properties=properties)]})
    row = _rows(event_type)[0]
    assert row.level == level
    assert (float(row.value) if row.value is not None else None) == value


def test_batch_is_logged(client, caplog):
    import logging

    logger = logging.getLogger("api.telemetry")
    logger.propagate = True
    try:
        with caplog.at_level(logging.INFO, logger="api.telemetry"):
            client.post("/telemetry/events", json={"events": [_event(), _event(eventId="x")]})
    finally:
        logger.propagate = False
    assert "received=2 stored=1 rejected=1" in caplog.text and "page_viewed×1" in caplog.text


@pytest.mark.parametrize(
    "bad",
    [
        {"eventId": "no-es-uuid"},
        {"timestamp": "18/11/2026"},
        {"timestamp": "2026-11-18T20:30:05+01:00"},  # no UTC
        {"event_type": "PageViewed"},
        {"schemaVersion": "1"},
        {"schemaVersion": "2.0.0"},  # versión que el contrato no conoce
        {"source": "mobile"},
        {"environment": "staging"},
        {"properties": {"page": "/x"}},  # faltan obligatorias del allowlist
    ],
)
def test_invalid_event_is_rejected_individually(client, bad):
    res = client.post("/telemetry/events", json={"events": [_event(**bad), _event()]})
    assert res.status_code == 200
    assert res.json() == {"received": 2, "stored": 1, "rejected": 1}


@pytest.mark.parametrize(
    "body",
    [b"{no json", b"[]", b'{"events": {}}', b"{}", b'"hola"'],
)
def test_unreadable_envelope_is_422(client, body):
    res = client.post("/telemetry/events", content=body, headers={"Content-Type": "application/json"})
    assert res.status_code == 422


def test_batch_size_limit(client):
    res = client.post("/telemetry/events", json={"events": [_event() for _ in range(201)]})
    assert res.status_code == 422


def test_empty_batch_is_ok(client):
    assert client.post("/telemetry/events", json={"events": []}).json() == {"received": 0, "stored": 0, "rejected": 0}


def test_no_update_or_delete_routes(client):
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)("/telemetry/events").status_code == 405


# --- X-Request-ID -----------------------------------------------------------------------


def test_request_id_is_echoed_or_generated(client):
    rid = str(uuid.uuid4())
    assert client.get("/api/health", headers={"X-Request-ID": rid}).headers["X-Request-ID"] == rid
    generated = client.get("/api/health", headers={"X-Request-ID": "nope"}).headers["X-Request-ID"]
    assert str(uuid.UUID(generated)) == generated


# --- Campos de inventario para la telemetría ------------------------------------------


def test_asset_requires_programme_and_product_category(client, auth_headers):
    body = {k: v for k, v in LAPTOP.items() if k not in ("programme_id", "product_category")}
    res = client.post("/inventory/products", json=body, headers=auth_headers)
    assert res.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [("programme_id", "Ventas B2B"), ("product_category", "hardware"), ("min_stock", -1)],
)
def test_asset_telemetry_fields_are_validated(client, auth_headers, field, value):
    res = client.post("/inventory/products", json={**LAPTOP, field: value}, headers=auth_headers)
    assert res.status_code == 422


def test_inbound_returns_currency_stock_after_and_cost_baseline(client, auth_headers, create_asset):
    asset = create_asset(LAPTOP)

    def post(cost):
        body = {"asset_id": asset["id"], "quantity": 2, "supplier": "TechDistrib Valencia S.L.",
                "office": "Valencia", "unit_cost": cost}
        res = client.post("/inventory/orders/inbound", json=body, headers=auth_headers)
        assert res.status_code == 201, res.text
        return res.json()

    first = post(800)
    assert first["currency"] == "EUR"  # Valencia → EUR, lo pone la API
    assert first["stock_after"] == 2
    assert first["cost_baseline"] is None  # sin historial
    assert post(820)["cost_baseline"] is None  # 1 previa: aún no hay media fiable
    third = post(950)
    assert third["stock_after"] == 6
    assert third["cost_baseline"] == {"unit_cost": 810.0, "sample_size": 2}


def test_inbound_without_unit_cost_has_no_currency(client, auth_headers, create_asset, inbound):
    asset = create_asset(LAPTOP)
    data = inbound(asset, 3).json()
    assert data["unit_cost"] is None and data["currency"] is None


def test_miami_inbound_uses_usd(client, auth_headers, create_asset):
    asset = create_asset({**LAPTOP, "sku": "NXV-IT-002", "office": "Miami"})
    body = {"asset_id": asset["id"], "quantity": 1, "supplier": "Office Depot Miami", "office": "Miami", "unit_cost": 900}
    assert client.post("/inventory/orders/inbound", json=body, headers=auth_headers).json()["currency"] == "USD"


def test_currency_cannot_be_sent(client, auth_headers, create_asset):
    asset = create_asset(LAPTOP)
    body = {"asset_id": asset["id"], "quantity": 1, "supplier": "X", "office": "Valencia", "unit_cost": 5, "currency": "USD"}
    assert client.post("/inventory/orders/inbound", json=body, headers=auth_headers).status_code == 422


def test_outbound_returns_stock_after_min_stock_and_recipient_type(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset({**LAPTOP, "min_stock": 4})
    inbound(asset, 6)
    data = outbound(asset, 3, "allocation", "Lucía Ferrer", recipient_type="support_agent").json()
    assert data["stock_after"] == 3
    assert data["min_stock"] == 4
    assert data["recipient_type"] == "support_agent"
    assert outbound(asset, 1, recipient_type="astronaut").status_code == 422


def test_orders_history_includes_telemetry_fields(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset(LAPTOP)
    client.post("/inventory/orders/inbound", headers=auth_headers, json={
        "asset_id": asset["id"], "quantity": 5, "supplier": "X", "office": "Valencia", "unit_cost": 10})
    outbound(asset, 1, recipient_type="employee")
    orders = client.get("/inventory/orders", headers=auth_headers).json()
    by_type = {o["order_type"]: o for o in orders}
    assert by_type["inbound"]["unit_cost"] == 10 and by_type["inbound"]["currency"] == "EUR"
    assert by_type["outbound"]["recipient_type"] == "employee"
    assert by_type["inbound"]["asset"]["programme_id"] == "onboarding-soporte"
    assert by_type["inbound"]["asset"]["product_category"] == "onboarding_equipment"
