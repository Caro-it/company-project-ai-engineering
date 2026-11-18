"""Proyecto Caching: TTL, invalidación y que nada privado entre en una clave compartida.

Para demostrar que una respuesta sale del caché se escribe directamente en la BD (sin
pasar por la API, como haría un script de seed): la API debe seguir devolviendo el
valor cacheado hasta que caduque el TTL o una escritura por la API lo invalide.
"""
from sqlmodel import Session

from app import cache, database
from app.cache import TTLCache
from app.models import AssetEntry

BASE = "/api/incidents"
NEW_INCIDENT = {
    "title": "ATS caído",
    "description": "El ATS no carga desde las 9:00",
    "category": "technical_failure",
    "origin": "internal",
    "branch": "remote",
}
LAPTOP = {"name": 'Portátil 14" Business', "sku": "NXV-IT-001", "category": "hardware", "office": "Valencia"}


# --- TTLCache aislado -----------------------------------------------------------------


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_ttl_cache_hits_until_expiry():
    clock = FakeClock()
    c = TTLCache("t", ttl_seconds=30, clock=clock)
    calls = []

    def compute():
        calls.append(1)
        return len(calls)

    assert c.get_or_set("k", compute) == 1
    clock.now += 29
    assert c.get_or_set("k", compute) == 1  # dentro del TTL: no recalcula
    clock.now += 2
    assert c.get_or_set("k", compute) == 2  # caducado: recalcula
    assert c.stats()["hits"] == 1 and c.stats()["misses"] == 2


def test_ttl_cache_keys_are_independent_and_invalidate_clears_all():
    c = TTLCache("t", ttl_seconds=60)
    assert c.get_or_set(("Valencia", None), lambda: "v") == "v"
    assert c.get_or_set(("Miami", None), lambda: "m") == "m"
    assert c.stats()["entries"] == 2
    c.invalidate()
    assert c.stats()["entries"] == 0
    assert c.get_or_set(("Valencia", None), lambda: "nuevo") == "nuevo"


def test_value_computed_during_an_invalidation_is_not_stored():
    """Si una escritura invalida mientras se calcula, ese cálculo puede estar obsoleto."""
    c = TTLCache("t", ttl_seconds=60)

    def compute_and_write_meanwhile():
        c.invalidate()  # simula un POST que llega mientras se consulta la BD
        return "viejo"

    assert c.get_or_set("k", compute_and_write_meanwhile) == "viejo"
    assert c.get_or_set("k", lambda: "fresco") == "fresco"


# --- GET /api/incidents/summary -------------------------------------------------------


def _total(client, auth_headers) -> int:
    return client.get(f"{BASE}/summary", headers=auth_headers).json()["total"]


def test_summary_is_served_from_cache(client, auth_headers):
    assert _total(client, auth_headers) == 0
    # Escritura directa en TinyDB: no pasa por la API, así que no invalida
    database.incidents_table.insert({"id": "x", "status": "open"})
    assert _total(client, auth_headers) == 0
    assert cache.incidents_summary_cache.stats()["hits"] == 1


def test_creating_an_incident_invalidates_summary(client, auth_headers):
    assert _total(client, auth_headers) == 0
    assert client.post(BASE, json=NEW_INCIDENT, headers=auth_headers).status_code == 201
    assert _total(client, auth_headers) == 1


def test_status_change_invalidates_summary(client, auth_headers):
    incident = client.post(BASE, json=NEW_INCIDENT, headers=auth_headers).json()
    before = client.get(f"{BASE}/summary", headers=auth_headers).json()["by_status"]
    assert before["open"] == 1 and before["in_progress"] == 0

    res = client.patch(f"{BASE}/{incident['id']}/status", json={"status": "in_progress"}, headers=auth_headers)
    assert res.status_code == 200
    after = client.get(f"{BASE}/summary", headers=auth_headers).json()["by_status"]
    assert after["open"] == 0 and after["in_progress"] == 1


def test_rejected_transition_keeps_cache(client, auth_headers):
    incident = client.post(BASE, json=NEW_INCIDENT, headers=auth_headers).json()
    _total(client, auth_headers)  # llena el caché
    res = client.patch(f"{BASE}/{incident['id']}/status", json={"status": "resolved"}, headers=auth_headers)
    assert res.status_code == 400
    _total(client, auth_headers)
    assert cache.incidents_summary_cache.stats()["hits"] == 1


# --- GET /inventory/products ----------------------------------------------------------


def _products(client, auth_headers, **params) -> list[dict]:
    res = client.get("/inventory/products", params=params, headers=auth_headers)
    assert res.status_code == 200
    return res.json()


def test_products_are_cached_per_filter(client, auth_headers):
    asset = client.post("/inventory/products", json=LAPTOP, headers=auth_headers).json()
    assert _products(client, auth_headers)[0]["current_stock"] == 0

    # Entrada escrita directamente en la BD: la API sigue sirviendo el stock cacheado
    with Session(database.engine) as session:
        session.add(AssetEntry(asset_id=asset["id"], quantity=5, supplier="X", office="Valencia", user_uuid="u"))
        session.commit()
    assert _products(client, auth_headers)[0]["current_stock"] == 0
    # Otra combinación de filtros es otra clave: se calcula y ya ve la entrada
    assert _products(client, auth_headers, office="Valencia")[0]["current_stock"] == 5


def test_inbound_and_outbound_orders_invalidate_products(client, auth_headers):
    asset = client.post("/inventory/products", json=LAPTOP, headers=auth_headers).json()
    assert _products(client, auth_headers)[0]["current_stock"] == 0

    res = client.post(
        "/inventory/orders/inbound",
        json={"asset_id": asset["id"], "quantity": 10, "supplier": "TechDistrib Valencia S.L.", "office": "Valencia"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert _products(client, auth_headers)[0]["current_stock"] == 10

    res = client.post(
        "/inventory/orders/outbound",
        json={"asset_id": asset["id"], "quantity": 3, "exit_type": "consumption", "assigned_to": None, "office": "Valencia"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert _products(client, auth_headers)[0]["current_stock"] == 7


def test_new_asset_invalidates_products(client, auth_headers):
    assert _products(client, auth_headers) == []
    client.post("/inventory/products", json=LAPTOP, headers=auth_headers)
    assert len(_products(client, auth_headers)) == 1


# --- Seguridad y evidencia ------------------------------------------------------------


def test_cache_requires_token_before_serving(client, auth_headers):
    """El caché va detrás de get_current_user: sin token nunca se sirve una respuesta cacheada."""
    _total(client, auth_headers)
    assert client.get(f"{BASE}/summary").status_code == 401
    assert client.get("/inventory/products").status_code == 401


def test_cache_stats_endpoint(client, auth_headers):
    _total(client, auth_headers)
    _total(client, auth_headers)
    assert client.get("/api/cache/stats").status_code == 401
    stats = {s["name"]: s for s in client.get("/api/cache/stats", headers=auth_headers).json()}
    assert stats["incidents_summary"]["hits"] == 1
    assert stats["incidents_summary"]["ttl_seconds"] == 30
    assert stats["inventory_products"]["ttl_seconds"] == 60


def test_responses_carry_timing_header(client):
    res = client.get("/api/health")
    assert float(res.headers["X-Response-Time-ms"]) >= 0
