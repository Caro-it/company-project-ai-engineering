"""Gestión de errores: 422 sin datos enviados, registros corruptos en la BD, CSV mal
formado y token de recuperación que no se gasta si falla el cambio de contraseña."""
from unittest.mock import patch

from app import database
from app.services.password_reset import create_reset_token
from app.services.users import get_user_by_email
from incidents_core.constants import EXPECTED_FIELDS

BASE = "/api/incidents"
VALID = {
    "title": "ATS caído",
    "description": "El ATS no carga desde las 9:00",
    "category": "technical_failure",
    "origin": "internal",
    "branch": "remote",
}


# --- 422 sin "input" ---


def test_422_does_not_echo_the_password(client):
    password = "corta77"  # menos de 8 caracteres: no pasa la validación
    res = client.post("/users", json={"email": "nuevo@example.com", "password": password})

    assert res.status_code == 422
    errors = res.json()["detail"]
    assert errors and all(set(error) == {"loc", "msg", "type"} for error in errors)
    assert password not in res.text


def test_422_on_reset_password_does_not_echo_the_new_password(client):
    password = "corta77"
    res = client.post("/auth/reset-password", json={"token": "x", "new_password": password})

    assert res.status_code == 422
    assert all("input" not in error for error in res.json()["detail"])
    assert password not in res.text


# --- Registros corruptos en incidents.json ---


def insert_corrupt_incidents() -> None:
    # Sin ninguno de los campos obligatorios
    database.incidents_table.insert({"id": "sin-campos", "title": "Incompleta"})
    # Estado desconocido
    database.incidents_table.insert({**VALID, "id": "estado-raro", "status": "zombi"})


def test_summary_survives_corrupt_records(client, auth_headers):
    assert client.post(BASE, json=VALID, headers=auth_headers).status_code == 201
    insert_corrupt_incidents()

    res = client.get(f"{BASE}/summary", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    # Los valores desconocidos o ausentes no suman en su desglose
    assert sum(body["by_status"].values()) == 1
    assert body["by_status"]["open"] == 1


def test_list_skips_corrupt_records(client, auth_headers):
    created = client.post(BASE, json=VALID, headers=auth_headers).json()
    insert_corrupt_incidents()

    res = client.get(BASE, headers=auth_headers)
    assert res.status_code == 200
    assert [incident["id"] for incident in res.json()] == [created["id"]]


def test_detail_of_corrupt_record_is_404_and_logs_only_the_id(client, auth_headers, caplog):
    insert_corrupt_incidents()

    for incident_id in ("estado-raro", "sin-campos"):
        caplog.clear()
        with caplog.at_level("WARNING", logger="app.services.incidents"):
            res = client.get(f"{BASE}/{incident_id}", headers=auth_headers)
        assert res.status_code == 404
        assert res.json() == {"detail": "Incidencia no encontrada", "code": "not_found"}
        # El log lleva el id y nada del contenido del registro
        assert incident_id in caplog.text
        assert "zombi" not in caplog.text
        assert "Incompleta" not in caplog.text


def test_transition_from_corrupt_status_is_400(client, auth_headers):
    insert_corrupt_incidents()

    for incident_id in ("estado-raro", "sin-campos"):
        res = client.patch(
            f"{BASE}/{incident_id}/status", json={"status": "in_progress"}, headers=auth_headers
        )
        assert res.status_code == 400
        body = res.json()
        assert body["code"] == "invalid_transition"
        assert body["allowed"] == []
        assert "no es válido" in body["detail"]


# --- CSV mal formado ---


def test_csv_error_is_422_with_readable_message(client, auth_headers):
    # Un campo por encima del límite del módulo csv (131072 caracteres) lanza csv.Error
    huge_field = '"' + "a" * 200_000 + '"'
    row = ",".join([huge_field] + ["x"] * (len(EXPECTED_FIELDS) - 1))
    content = f"{','.join(EXPECTED_FIELDS)}\n{row}\n".encode("utf-8")

    res = client.post(
        f"{BASE}/analyze",
        files={"file": ("incidencias.csv", content, "text/csv")},
        headers=auth_headers,
    )
    assert res.status_code == 422
    assert res.json() == {"detail": "El fichero CSV está mal formado y no se ha podido leer."}


# --- Token de recuperación ---


def test_reset_token_stays_valid_if_update_fails(client, auth_headers):
    user_id = get_user_by_email("qa@example.com")["id"]
    token = create_reset_token(user_id)
    payload = {"token": token, "new_password": "NuevaClave123"}

    with patch("app.routers.auth.update_user", side_effect=RuntimeError("fallo de escritura")):
        res = client.post("/auth/reset-password", json=payload)
    assert res.status_code == 500

    # El enlace no se ha gastado: el reintento funciona y después ya no vale
    assert client.post("/auth/reset-password", json=payload).status_code == 200
    assert client.post("/auth/reset-password", json=payload).status_code == 400

    login = client.post(
        "/auth/login", data={"username": "qa@example.com", "password": "NuevaClave123"}
    )
    assert login.status_code == 200
