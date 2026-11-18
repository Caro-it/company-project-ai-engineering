# ruff: noqa: F811  (fixtures importadas de test_inventory_api)
"""Stub POST /telemetry/events (proyecto de captura) y campos de inventario para telemetría."""
import json
import uuid

import pytest
from test_inventory_api import LAPTOP, create_asset, inbound, outbound  # noqa: F401


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


# --- Stub -------------------------------------------------------------------------------


def test_batch_returns_received_count_without_token(client):
    events = [_event(), _event(event_type="inbound_order_created", properties={"quantity": 3})]
    res = client.post("/telemetry/events", json={"events": events})
    assert res.status_code == 200
    assert res.json() == {"received": 2}


def test_text_plain_body_from_send_beacon_is_accepted(client):
    """sendBeacon envía un Blob text/plain para evitar el preflight CORS."""
    body = json.dumps({"events": [_event()]})
    res = client.post("/telemetry/events", content=body, headers={"Content-Type": "text/plain;charset=UTF-8"})
    assert res.status_code == 200
    assert res.json() == {"received": 1}


def test_batch_is_logged_with_event_types(client, caplog):
    import logging

    logger = logging.getLogger("api.telemetry")
    logger.propagate = True
    try:
        with caplog.at_level(logging.INFO, logger="api.telemetry"):
            client.post("/telemetry/events", json={"events": [_event(), _event()]})
    finally:
        logger.propagate = False
    assert "2 events" in caplog.text and "page_viewed×2" in caplog.text


@pytest.mark.parametrize(
    "bad",
    [
        {"eventId": "no-es-uuid"},
        {"timestamp": "18/11/2026"},
        {"timestamp": "2026-11-18T20:30:05+01:00"},  # no UTC
        {"event_type": "PageViewed"},
        {"event_type": "viewed"},  # sin entidad_acción
        {"schemaVersion": "1"},
        {"source": "mobile"},
        {"environment": "staging"},
    ],
)
def test_invalid_envelope_is_rejected(client, bad):
    res = client.post("/telemetry/events", json={"events": [_event(**bad)]})
    assert res.status_code == 422


def test_unknown_envelope_field_is_rejected(client):
    event = _event()
    event["email"] = "ana@nexova.com"
    res = client.post("/telemetry/events", json={"events": [event]})
    assert res.status_code == 422
    assert "ana@nexova.com" not in res.text  # el error no devuelve el input


@pytest.mark.parametrize("body", [{"events": []}, {}, {"events": [_event()], "extra": 1}])
def test_invalid_batch_is_rejected(client, body):
    assert client.post("/telemetry/events", json=body).status_code == 422


def test_malformed_json_is_rejected(client):
    res = client.post("/telemetry/events", content=b"{no json", headers={"Content-Type": "text/plain"})
    assert res.status_code == 422


def test_batch_size_limit(client):
    res = client.post("/telemetry/events", json={"events": [_event() for _ in range(201)]})
    assert res.status_code == 422


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
