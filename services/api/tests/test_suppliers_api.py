"""Directorio de Proveedores (/suppliers, API-042): qué se guarda, qué se rechaza y
qué cambia en cada operación. Todas las rutas exigen sesión."""
import pytest

from app.database import suppliers_table

BASE = "/suppliers"
SPAIN_ATS = {
    "name": "Talentia ATS",
    "country": "Spain",
    "categories": ["ats_software"],
    "monthly_rate": 1200.0,
    "currency": "EUR",
    "status": "active",
}
USA_BOARD = {
    "name": "JobBoard Inc",
    "country": "USA",
    "categories": ["job_boards", "ats_software"],
    "monthly_rate": 900.0,
    "currency": "USD",
    "status": "active",
}
OLD_TIMESTAMP = "2020-01-01T00:00:00+00:00"


@pytest.fixture
def create(client, auth_headers):
    """Crea un proveedor por la API y devuelve su id."""

    def _create(payload: dict) -> int:
        res = client.post(BASE, json=payload, headers=auth_headers)
        assert res.status_code == 201
        return res.json()["id"]

    return _create


def stored(supplier_id: int) -> dict | None:
    doc = suppliers_table.get(doc_id=supplier_id)
    return dict(doc) if doc is not None else None


# --- POST /suppliers ---


def test_alta_proveedor_valido_se_guarda_con_fecha_de_actualizacion(client, auth_headers):
    res = client.post(BASE, json=SPAIN_ATS, headers=auth_headers)

    assert res.status_code == 201
    doc = stored(res.json()["id"])
    assert doc["name"] == "Talentia ATS"
    assert doc["monthly_rate"] == 1200.0
    # updated_at lo pone el sistema, no el cliente
    assert doc["updated_at"]


def test_alta_con_moneda_que_no_corresponde_al_pais_se_rechaza(client, auth_headers):
    res = client.post(BASE, json={**SPAIN_ATS, "currency": "USD"}, headers=auth_headers)

    assert res.status_code == 422
    assert suppliers_table.all() == []


def test_alta_sin_categorias_o_con_tarifa_cero_se_rechaza(client, auth_headers):
    no_categories = client.post(BASE, json={**SPAIN_ATS, "categories": []}, headers=auth_headers)
    zero_rate = client.post(BASE, json={**SPAIN_ATS, "monthly_rate": 0}, headers=auth_headers)

    assert no_categories.status_code == zero_rate.status_code == 422
    assert suppliers_table.all() == []


def test_alta_con_id_o_updated_at_del_cliente_se_rechaza(client, auth_headers):
    res = client.post(
        BASE, json={**SPAIN_ATS, "id": 99, "updated_at": OLD_TIMESTAMP}, headers=auth_headers
    )

    assert res.status_code == 422
    assert suppliers_table.all() == []


def test_alta_sin_token_es_401_y_no_guarda_nada(client):
    assert client.post(BASE, json=SPAIN_ATS).status_code == 401
    assert suppliers_table.all() == []


# --- GET /suppliers ---


def test_listado_sin_filtros_devuelve_todos(client, auth_headers, create):
    ids = {create(SPAIN_ATS), create(USA_BOARD)}

    res = client.get(BASE, headers=auth_headers)

    assert res.status_code == 200
    assert {supplier["id"] for supplier in res.json()} == ids


def test_listado_filtra_por_pais_y_categoria_a_la_vez(client, auth_headers, create):
    spain_id = create(SPAIN_ATS)
    usa_id = create(USA_BOARD)

    # Los dos tienen ats_software: el país decide
    both = client.get(BASE, params={"category": "ats_software"}, headers=auth_headers).json()
    usa_ats = client.get(
        BASE, params={"country": "USA", "category": "ats_software"}, headers=auth_headers
    ).json()
    spain_boards = client.get(
        BASE, params={"country": "Spain", "category": "job_boards"}, headers=auth_headers
    ).json()

    assert {supplier["id"] for supplier in both} == {spain_id, usa_id}
    assert [supplier["id"] for supplier in usa_ats] == [usa_id]
    assert spain_boards == []


def test_listado_sin_token_es_401(client, create):
    create(SPAIN_ATS)
    assert client.get(BASE).status_code == 401


# --- GET /suppliers/{id} ---


def test_detalle_devuelve_el_proveedor_pedido(client, auth_headers, create):
    create(SPAIN_ATS)
    usa_id = create(USA_BOARD)

    res = client.get(f"{BASE}/{usa_id}", headers=auth_headers)

    assert res.status_code == 200
    assert res.json()["name"] == "JobBoard Inc"


def test_detalle_de_id_inexistente_es_404(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)
    assert client.get(f"{BASE}/{supplier_id + 1}", headers=auth_headers).status_code == 404


# --- PATCH /suppliers/{id}/rate ---


def test_cambio_de_tarifa_actualiza_la_tarifa_y_la_fecha(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)
    suppliers_table.update({"updated_at": OLD_TIMESTAMP}, doc_ids=[supplier_id])

    res = client.patch(f"{BASE}/{supplier_id}/rate", json={"monthly_rate": 1500.5}, headers=auth_headers)

    assert res.status_code == 200
    doc = stored(supplier_id)
    assert doc["monthly_rate"] == 1500.5
    # Trazabilidad: cada cambio de tarifa deja su fecha
    assert doc["updated_at"] > OLD_TIMESTAMP


def test_cambio_a_tarifa_cero_o_negativa_se_rechaza_sin_cambios(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)

    for rate in (0, -10):
        res = client.patch(
            f"{BASE}/{supplier_id}/rate", json={"monthly_rate": rate}, headers=auth_headers
        )
        assert res.status_code == 422
    assert stored(supplier_id)["monthly_rate"] == 1200.0


def test_cambio_de_tarifa_de_id_inexistente_es_404_sin_crear_nada(client, auth_headers):
    res = client.patch(f"{BASE}/1/rate", json={"monthly_rate": 100}, headers=auth_headers)

    assert res.status_code == 404
    assert suppliers_table.all() == []


# --- PATCH /suppliers/{id}/status ---


def test_cambio_de_estado_no_toca_la_fecha_de_tarifa(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)
    suppliers_table.update({"updated_at": OLD_TIMESTAMP}, doc_ids=[supplier_id])

    res = client.patch(
        f"{BASE}/{supplier_id}/status", json={"status": "suspended"}, headers=auth_headers
    )

    assert res.status_code == 200
    doc = stored(supplier_id)
    assert doc["status"] == "suspended"
    # updated_at es la fecha del último cambio de TARIFA, no de cualquier cambio
    assert doc["updated_at"] == OLD_TIMESTAMP


def test_cambio_a_estado_desconocido_se_rechaza_sin_cambios(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)

    res = client.patch(
        f"{BASE}/{supplier_id}/status", json={"status": "deleted"}, headers=auth_headers
    )

    assert res.status_code == 422
    assert stored(supplier_id)["status"] == "active"


def test_cambio_de_estado_de_id_inexistente_es_404(client, auth_headers):
    res = client.patch(f"{BASE}/7/status", json={"status": "suspended"}, headers=auth_headers)

    assert res.status_code == 404
    assert suppliers_table.all() == []


# --- DELETE /suppliers/{id} ---


def test_borrado_elimina_solo_ese_proveedor(client, auth_headers, create):
    spain_id = create(SPAIN_ATS)
    usa_id = create(USA_BOARD)

    res = client.delete(f"{BASE}/{spain_id}", headers=auth_headers)

    assert res.status_code == 200
    assert stored(spain_id) is None
    assert stored(usa_id) is not None
    assert client.get(f"{BASE}/{spain_id}", headers=auth_headers).status_code == 404


def test_borrado_dos_veces_la_segunda_es_404(client, auth_headers, create):
    supplier_id = create(SPAIN_ATS)

    assert client.delete(f"{BASE}/{supplier_id}", headers=auth_headers).status_code == 200
    assert client.delete(f"{BASE}/{supplier_id}", headers=auth_headers).status_code == 404


def test_borrado_sin_token_es_401_y_no_borra(client, create):
    supplier_id = create(SPAIN_ATS)

    assert client.delete(f"{BASE}/{supplier_id}").status_code == 401
    assert stored(supplier_id) is not None
