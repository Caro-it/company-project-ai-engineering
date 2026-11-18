"""Contrato de serialización (docs/serialization-audit.md).

- Los endpoints de auth sin sesión no devuelven email, contraseña ni hash.
- GET /auth/me sí devuelve el email del propio usuario.
- Los listados devuelven solo los campos de su esquema de lista.
- Las entradas rechazan campos que el cliente no puede escribir (422).
- Ninguna ruta JSON queda sin esquema en OpenAPI.
"""
import pytest

from app.auth_models import Role, UserUpdate
from app.main import app
from app.services.password_reset import create_reset_token
from app.services.users import get_user_by_email, update_user

EMAIL = "serializacion@example.com"
PASSWORD = "Password123"
SENSITIVE = {"email", "password", "hashed_password", "new_password"}


def _keys(body: dict) -> set[str]:
    return set(body)


# --- Auth sin sesión: nunca el email -----------------------------------------------


def test_registro_no_devuelve_email_ni_contrasena(client):
    res = client.post("/users", json={"email": EMAIL, "password": PASSWORD, "name": "Ana"})

    assert res.status_code == 201
    assert _keys(res.json()) == {"id", "role", "created_at"}
    assert res.json()["role"] == "user"


def test_login_solo_devuelve_el_token(client, register_user):
    register_user(EMAIL, PASSWORD)

    res = client.post("/auth/login", data={"username": EMAIL, "password": PASSWORD})

    assert res.status_code == 200
    assert _keys(res.json()) == {"access_token", "token_type"}


def test_forgot_password_no_devuelve_email(client, register_user, monkeypatch):
    monkeypatch.setattr("app.routers.auth.send_password_reset_email", lambda *_: None)
    register_user(EMAIL, PASSWORD)

    res = client.post("/auth/forgot-password", json={"email": EMAIL})

    assert res.status_code == 200
    assert _keys(res.json()) == {"message"}
    assert EMAIL not in res.text


def test_reset_password_no_devuelve_email(client, register_user):
    user_id = register_user(EMAIL, PASSWORD)
    token = create_reset_token(user_id)

    res = client.post(
        "/auth/reset-password", json={"token": token, "new_password": "OtraPassword123"}
    )

    assert res.status_code == 200
    assert _keys(res.json()) == {"message"}
    assert EMAIL not in res.text


@pytest.mark.parametrize(
    ("method", "path", "kwargs"),
    [
        ("post", "/users", {"json": {"email": "otra@example.com", "password": PASSWORD}}),
        ("post", "/auth/login", {"data": {"username": EMAIL, "password": PASSWORD}}),
        ("post", "/auth/forgot-password", {"json": {"email": EMAIL}}),
    ],
)
def test_auth_sin_sesion_nunca_expone_campos_sensibles(client, register_user, monkeypatch, method, path, kwargs):
    monkeypatch.setattr("app.routers.auth.send_password_reset_email", lambda *_: None)
    register_user(EMAIL, PASSWORD)

    res = getattr(client, method)(path, **kwargs)

    assert res.is_success
    assert SENSITIVE.isdisjoint(res.json())


# --- Auth con sesión: /auth/me sí lleva el email -------------------------------------


def test_me_devuelve_el_email_propio_y_perfil_sin_ids(client, auth_headers):
    res = client.get("/auth/me", headers=auth_headers)

    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "qa@example.com"
    assert _keys(body) == {"email", "role", "profile"}
    assert _keys(body["profile"]) == {"name", "phone", "address"}


# --- Listados: solo los campos del esquema de lista ---------------------------------


SUPPLIER = {
    "name": "Proveedor QA",
    "country": "Spain",
    "categories": ["job_boards"],
    "monthly_rate": 100,
    "currency": "EUR",
    "status": "active",
    "notes": "Nota interna larga",
}


def test_listado_de_proveedores_usa_el_esquema_de_lista(client, auth_headers):
    created = client.post("/suppliers", json=SUPPLIER, headers=auth_headers)
    assert "notes" in created.json()  # el detalle sí lleva notes

    res = client.get("/suppliers", headers=auth_headers)

    assert res.status_code == 200
    assert _keys(res.json()[0]) == {
        "id", "name", "country", "categories", "monthly_rate", "currency", "status",
        "contract_renewal_date", "contact_email", "updated_at",
    }


def test_listado_de_usuarios_usa_el_esquema_de_lista(client, auth_headers):
    admin = get_user_by_email("qa@example.com")
    update_user(admin["id"], UserUpdate(role=Role.ADMIN))

    res = client.get("/users", headers=auth_headers)

    assert res.status_code == 200
    assert {frozenset(user) for user in res.json()} == {frozenset({"id", "email", "role", "is_active"})}


def test_listado_de_incidencias_no_lleva_updated_at(client, auth_headers):
    payload = {
        "title": "Fallo", "description": "Descripción", "category": "technical_failure",
        "origin": "internal", "branch": "central",
    }
    detail = client.post("/api/incidents", json=payload, headers=auth_headers).json()
    assert "updated_at" in detail

    rows = client.get("/api/incidents", headers=auth_headers).json()

    assert _keys(rows[0]) == {
        "id", "title", "description", "category", "origin", "branch", "status", "created_at",
    }


def test_ordenes_de_inventario_anidan_el_activo_sin_asset_id(client, auth_headers):
    asset = client.post(
        "/inventory/products",
        json={"name": "Hub USB-C", "sku": "NXV-SER-001", "category": "peripherals", "office": "Miami"},
        headers=auth_headers,
    ).json()

    res = client.post(
        "/inventory/orders/inbound",
        json={"asset_id": asset["id"], "quantity": 2, "supplier": "X", "office": "Miami"},
        headers=auth_headers,
    )

    assert res.status_code == 201
    assert "asset_id" not in res.json()
    assert res.json()["asset"] == {"id": asset["id"], "name": "Hub USB-C", "sku": "NXV-SER-001"}


# --- Entradas: campos no permitidos -> 422 -------------------------------------------


@pytest.mark.parametrize(
    ("path", "extra"),
    [
        ("/users", {"is_active": False}),
        ("/users", {"created_at": "2020-01-01T00:00:00Z"}),
        ("/suppliers", {"id": 99}),
        ("/suppliers", {"updated_at": "2020-01-01T00:00:00Z"}),
    ],
)
def test_entrada_con_campo_no_permitido_es_422(client, auth_headers, path, extra):
    base = {"email": "nuevo@example.com", "password": PASSWORD} if path == "/users" else SUPPLIER

    res = client.post(path, json={**base, **extra}, headers=auth_headers)

    assert res.status_code == 422
    assert res.json()["detail"][0]["type"] == "extra_forbidden"


# --- Respuestas tipadas -------------------------------------------------------------


def test_health_tiene_esquema():
    from fastapi.testclient import TestClient

    res = TestClient(app).get("/api/health")
    assert res.json() == {"status": "ok"}


# Rutas sin cuerpo JSON, documentadas en docs/serialization-audit.md
NO_JSON_BODY = {("get", "/api/incidents/results/export"), ("delete", "/users/{user_id}")}


def test_ninguna_respuesta_json_queda_sin_esquema():
    spec = app.openapi()
    untyped = []
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            if (method, path) in NO_JSON_BODY:
                continue
            ok = [code for code in operation["responses"] if code.startswith("2")]
            for code in ok:
                schema = operation["responses"][code].get("content", {}).get(
                    "application/json", {}
                ).get("schema", {})
                target = schema.get("items", schema)
                if "$ref" not in target:
                    untyped.append(f"{method.upper()} {path}")
    assert untyped == []


def test_export_se_documenta_como_csv():
    operation = app.openapi()["paths"]["/api/incidents/results/export"]["get"]
    assert "text/csv" in operation["responses"]["200"]["content"]
