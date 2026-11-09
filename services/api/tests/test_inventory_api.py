"""Inventario (NXV-0201): endpoints /inventory, stock calculado y reglas del BRIEFING.

Supabase se sustituye por SQLite en memoria (conftest.py); TinyDB por MemoryStorage.
"""
import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import database, seed_inventory
from app.models import Asset, AssetEntry, AssetExit
from app.services.users import get_user_by_email

LAPTOP = {"name": 'Portátil 14" Business', "sku": "NXV-IT-001", "category": "hardware", "office": "Valencia"}
PAPER = {"name": "Resma de papel A4", "sku": "NXV-OFF-001", "category": "office_supplies", "office": "Valencia"}
HUB_MIAMI = {"name": "Hub USB-C", "sku": "NXV-PER-002", "category": "peripherals", "office": "Miami"}


@pytest.fixture
def create_asset(client, auth_headers):
    def _create(data: dict) -> dict:
        res = client.post("/inventory/products", json=data, headers=auth_headers)
        assert res.status_code == 201, res.text
        return res.json()

    return _create


@pytest.fixture
def inbound(client, auth_headers):
    def _inbound(asset: dict, quantity: int, supplier: str = "TechDistrib Valencia S.L."):
        return client.post(
            "/inventory/orders/inbound",
            json={"asset_id": asset["id"], "quantity": quantity, "supplier": supplier, "office": asset["office"]},
            headers=auth_headers,
        )

    return _inbound


@pytest.fixture
def outbound(client, auth_headers):
    def _outbound(asset: dict, quantity: int, exit_type: str = "consumption", assigned_to=None, **extra):
        body = {
            "asset_id": asset["id"],
            "quantity": quantity,
            "exit_type": exit_type,
            "assigned_to": assigned_to,
            "office": asset["office"],
            **extra,
        }
        return client.post("/inventory/orders/outbound", json=body, headers=auth_headers)

    return _outbound


def _stock(client, auth_headers, asset_id: int) -> int:
    return client.get(f"/inventory/products/{asset_id}", headers=auth_headers).json()["current_stock"]


# --- Autenticación --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/inventory/products"),
        ("post", "/inventory/products"),
        ("get", "/inventory/products/1"),
        ("post", "/inventory/orders/inbound"),
        ("post", "/inventory/orders/outbound"),
        ("get", "/inventory/orders"),
    ],
)
def test_all_inventory_routes_require_token(client, method, path):
    assert getattr(client, method)(path).status_code == 401


# --- Activos ------------------------------------------------------------------------


def test_new_asset_starts_with_zero_stock(create_asset):
    asset = create_asset(LAPTOP)
    assert asset == {**LAPTOP, "id": asset["id"], "current_stock": 0}


def test_asset_cannot_be_created_with_stock(client, auth_headers):
    res = client.post("/inventory/products", json={**LAPTOP, "current_stock": 50}, headers=auth_headers)
    assert res.status_code == 422


def test_duplicate_sku_is_409(client, auth_headers, create_asset):
    create_asset(LAPTOP)
    res = client.post("/inventory/products", json={**LAPTOP, "office": "Miami"}, headers=auth_headers)
    assert res.status_code == 409


@pytest.mark.parametrize(("field", "value"), [("category", "furniture"), ("office", "Madrid")])
def test_asset_catalog_values_are_enforced(client, auth_headers, field, value):
    res = client.post("/inventory/products", json={**LAPTOP, field: value}, headers=auth_headers)
    assert res.status_code == 422


def test_get_unknown_asset_is_404(client, auth_headers):
    assert client.get("/inventory/products/999", headers=auth_headers).status_code == 404


def test_no_endpoint_can_set_stock_directly(client):
    """Ninguna ruta PUT/PATCH sobre activos: el stock solo cambia con órdenes."""
    methods = {
        (route.path, method)
        for route in client.app.routes
        if getattr(route, "path", "").startswith("/inventory")
        for method in route.methods
    }
    assert not any(method in {"PUT", "PATCH", "DELETE"} for _, method in methods)


# --- Stock calculado ------------------------------------------------------------------


def test_stock_is_entries_minus_exits(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset(LAPTOP)
    assert inbound(asset, 10).status_code == 201
    assert inbound(asset, 5).status_code == 201
    assert outbound(asset, 3, "allocation", "Lucía Ferrer").status_code == 201
    assert _stock(client, auth_headers, asset["id"]) == 12
    listed = client.get("/inventory/products", headers=auth_headers).json()
    assert listed[0]["current_stock"] == 12


def test_offices_do_not_share_stock(client, auth_headers, create_asset, inbound):
    valencia = create_asset(LAPTOP)
    miami = create_asset({**LAPTOP, "sku": "NXV-IT-002", "office": "Miami"})
    inbound(valencia, 10)
    assert _stock(client, auth_headers, miami["id"]) == 0
    only_miami = client.get("/inventory/products?office=Miami", headers=auth_headers).json()
    assert [a["sku"] for a in only_miami] == ["NXV-IT-002"]


def test_order_office_must_match_asset_office(client, auth_headers, create_asset):
    asset = create_asset(LAPTOP)
    res = client.post(
        "/inventory/orders/inbound",
        json={"asset_id": asset["id"], "quantity": 5, "supplier": "Office Depot Miami", "office": "Miami"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert _stock(client, auth_headers, asset["id"]) == 0


# --- Órdenes: reglas del BRIEFING --------------------------------------------------------


def test_orders_store_tinydb_user_uuid(create_asset, inbound, outbound):
    user_id = get_user_by_email("qa@example.com")["id"]
    asset = create_asset(PAPER)
    entry = inbound(asset, 20).json()
    exit_ = outbound(asset, 4).json()
    assert entry["user_uuid"] == user_id
    assert exit_["user_uuid"] == user_id


def test_user_uuid_cannot_be_sent_in_body(client, auth_headers, create_asset):
    asset = create_asset(PAPER)
    res = client.post(
        "/inventory/orders/inbound",
        json={"asset_id": asset["id"], "quantity": 1, "supplier": "X", "office": "Valencia", "user_uuid": "otro"},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_outbound_over_stock_is_400_and_writes_nothing(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset(LAPTOP)
    inbound(asset, 5)
    res = outbound(asset, 6, "allocation", "Lucía Ferrer")
    assert res.status_code == 400
    assert res.json()["detail"] == (
        "Insufficient stock for asset 'Portátil 14\" Business'. Available: 5, requested: 6."
    )
    with Session(database.engine) as session:
        assert session.exec(select(AssetExit)).all() == []
    assert _stock(client, auth_headers, asset["id"]) == 5


def test_outbound_of_exact_stock_leaves_zero(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset(PAPER)
    inbound(asset, 4)
    assert outbound(asset, 4).status_code == 201
    assert _stock(client, auth_headers, asset["id"]) == 0


def test_allocation_requires_assigned_to(create_asset, inbound, outbound):
    asset = create_asset(LAPTOP)
    inbound(asset, 5)
    assert outbound(asset, 1, "allocation", None).status_code == 422


def test_consumption_rejects_assigned_to(create_asset, inbound, outbound):
    asset = create_asset(PAPER)
    inbound(asset, 5)
    assert outbound(asset, 1, "consumption", "Lucía Ferrer").status_code == 422


@pytest.mark.parametrize("quantity", [0, -3])
def test_quantity_must_be_positive(create_asset, inbound, outbound, quantity):
    asset = create_asset(PAPER)
    assert inbound(asset, quantity).status_code == 422
    assert outbound(asset, quantity).status_code == 422


def test_order_for_unknown_asset_is_404(client, auth_headers):
    fake = {"id": 999, "office": "Valencia"}
    res = client.post(
        "/inventory/orders/inbound",
        json={"asset_id": fake["id"], "quantity": 1, "supplier": "X", "office": "Valencia"},
        headers=auth_headers,
    )
    assert res.status_code == 404


# --- Historial ------------------------------------------------------------------------


def test_orders_list_includes_asset_data_and_user(client, auth_headers, create_asset, inbound, outbound):
    asset = create_asset(HUB_MIAMI)
    inbound(asset, 6, "Office Depot Miami")
    outbound(asset, 2, "allocation", "Daniel Ortiz")
    orders = client.get("/inventory/orders", headers=auth_headers).json()
    assert {o["order_type"] for o in orders} == {"inbound", "outbound"}
    for order in orders:
        assert order["asset"]["sku"] == "NXV-PER-002"
        assert order["asset"]["name"] == "Hub USB-C"
        assert order["office"] == "Miami"
        assert order["user_uuid"]
    outbound_order = next(o for o in orders if o["order_type"] == "outbound")
    assert outbound_order["assigned_to"] == "Daniel Ortiz"
    assert outbound_order["exit_type"] == "allocation"
    assert client.get("/inventory/orders?office=Valencia", headers=auth_headers).json() == []


def _count_queries(client, path, headers) -> int:
    statements = []

    def _listener(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(database.engine, "before_cursor_execute", _listener)
    try:
        assert client.get(path, headers=headers).status_code == 200
    finally:
        event.remove(database.engine, "before_cursor_execute", _listener)
    return len(statements)


def test_listings_have_no_n_plus_one(client, auth_headers, create_asset, inbound, outbound):
    """El número de consultas no crece con el número de activos u órdenes."""
    asset = create_asset(PAPER)
    inbound(asset, 10)
    outbound(asset, 1)
    few = {p: _count_queries(client, p, auth_headers) for p in ("/inventory/products", "/inventory/orders")}

    for i in range(5):
        extra = create_asset({**PAPER, "sku": f"NXV-OFF-1{i}"})
        inbound(extra, 10)
        outbound(extra, 1)
    many = {p: _count_queries(client, p, auth_headers) for p in ("/inventory/products", "/inventory/orders")}
    assert many == few


# --- Base de datos: FK y CHECK -------------------------------------------------------


def test_db_rejects_entry_for_missing_asset():
    with Session(database.engine) as session:
        session.add(AssetEntry(asset_id=999, quantity=1, supplier="X", office="Valencia", user_uuid="u"))
        with pytest.raises(IntegrityError):
            session.commit()


def test_db_rejects_allocation_without_assigned_to():
    with Session(database.engine) as session:
        asset = Asset(**LAPTOP)
        session.add(asset)
        session.commit()
        session.add(
            AssetExit(asset_id=asset.id, quantity=1, exit_type="allocation", office="Valencia", user_uuid="u")
        )
        with pytest.raises(IntegrityError):
            session.commit()


# --- Datos semilla --------------------------------------------------------------------


def test_seed_matches_briefing_and_is_idempotent(client, auth_headers):
    user_id = get_user_by_email("qa@example.com")["id"]
    with Session(database.engine) as session:
        first = seed_inventory.run(session, user_id)
        second = seed_inventory.run(session, user_id)
    assert first == {"assets": 6, "entries": 5, "exits": 3}
    assert second == {"assets": 0, "entries": 0, "exits": 0}

    stock = {a["sku"]: a["current_stock"] for a in client.get("/inventory/products", headers=auth_headers).json()}
    assert stock == {
        "NXV-IT-001": 12,
        "NXV-IT-002": 8,
        "NXV-PER-001": 0,
        "NXV-PER-002": 4,
        "NXV-OFF-001": 16,
        "NXV-TRN-001": 0,
    }
    orders = client.get("/inventory/orders", headers=auth_headers).json()
    exit_types = {o["exit_type"] for o in orders if o["order_type"] == "outbound"}
    assert exit_types == {"allocation", "consumption"}
