"""Endpoints del Gestor de Incidencias y manejo de errores (app/errors.py)."""
import logging

import pytest

import app.routers.incidents as incidents_router

BASE = "/api/incidents"
VALID = {
    "title": "ATS caído",
    "description": "El ATS no carga desde las 9:00",
    "category": "technical_failure",
    "origin": "internal",
    "branch": "remote",
}
BACKOFFICE_ORIGIN = "http://localhost:3001"


def field_codes(res) -> list[tuple[str, str]]:
    body = res.json()
    assert body["detail"] == "Datos no válidos"
    assert body["code"] == "validation_error"
    return [(e["field"], e["code"]) for e in body["errors"]]


def open_ids(client, auth_headers) -> list[str]:
    res = client.get(f"{BASE}?status=open", headers=auth_headers)
    return [i["id"] for i in res.json()]


# --- Lecturas con la BD vacía ---


def test_empty_list(client, auth_headers):
    res = client.get(BASE, headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == []


def test_empty_summary_has_every_key_at_zero(client, auth_headers):
    res = client.get(f"{BASE}/summary", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert len(body["by_status"]) == 4
    assert len(body["by_category"]) == 8
    assert len(body["by_origin"]) == 3
    assert len(body["by_branch"]) == 4
    for group in ("by_status", "by_category", "by_origin", "by_branch"):
        assert set(body[group].values()) == {0}


# --- Alta ---


def test_create_valid(client, auth_headers):
    res = client.post(BASE, json=VALID, headers=auth_headers)
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "open"
    assert body["created_at"] == body["updated_at"]
    assert len(body["id"]) == 36
    assert {k: body[k] for k in VALID} == VALID


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({k: v for k, v in VALID.items() if k != "title"}, [("title", "required")]),
        ({**VALID, "title": "   "}, [("title", "empty_text")]),
        ({**VALID, "category": "hardware"}, [("category", "invalid_choice")]),
        ({**VALID, "branch": "headquarters"}, [("branch", "invalid_choice")]),
        ({**VALID, "status": "resolved"}, [("status", "extra_field_not_allowed")]),
    ],
    ids=["sin-title", "title-en-blanco", "category-invalida", "branch-headquarters", "status-en-body"],
)
def test_create_validation_errors_are_400(client, auth_headers, payload, expected):
    res = client.post(BASE, json=payload, headers=auth_headers)
    assert res.status_code == 400
    assert field_codes(res) == expected


def test_create_messages_are_in_spanish(client, auth_headers):
    res = client.post(BASE, json={k: v for k, v in VALID.items() if k != "title"}, headers=auth_headers)
    assert res.json()["errors"][0]["message"] == "El título es obligatorio"

    res = client.post(BASE, json={**VALID, "branch": "headquarters"}, headers=auth_headers)
    error = res.json()["errors"][0]
    assert error["allowed"] == ["central", "valencia_operations", "miami_office", "remote"]
    assert error["message"].startswith("La sede no tiene un valor permitido")


def test_create_malformed_json(client, auth_headers):
    res = client.post(
        BASE,
        content="{no json",
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert res.status_code == 400
    assert field_codes(res) == [("body", "invalid_json")]


# --- Resumen y listado tras el seed ---


def test_summary_after_seed(client, auth_headers, seed_report):
    body = client.get(f"{BASE}/summary", headers=auth_headers).json()
    nonzero = lambda group: {k: v for k, v in body[group].items() if v}  # noqa: E731
    assert body["total"] == 96
    assert nonzero("by_status") == {"open": 27, "resolved": 56, "discarded": 13}
    assert nonzero("by_category") == {"technical_failure": 49, "process_error": 35, "client_complaint": 12}
    assert nonzero("by_origin") == {"customer": 96}
    assert nonzero("by_branch") == {"central": 96}


def test_list_after_seed_never_exposes_emails(client, auth_headers, seed_report):
    res = client.get(BASE, headers=auth_headers)
    assert len(res.json()) == 96
    assert {k for i in res.json() for k in i} == {
        "id", "title", "description", "status", "category", "origin", "branch", "created_at", "updated_at",
    }
    assert "@" not in res.text
    assert "customer_email" not in res.text


def test_list_is_newest_first(client, auth_headers, seed_report):
    dates = [i["created_at"] for i in client.get(BASE, headers=auth_headers).json()]
    assert dates == sorted(dates, reverse=True)


def test_filters(client, auth_headers, seed_report):
    assert len(client.get(f"{BASE}?status=open", headers=auth_headers).json()) == 27
    combined = client.get(f"{BASE}?status=open&category=client_complaint", headers=auth_headers).json()
    assert combined
    assert all(i["status"] == "open" and i["category"] == "client_complaint" for i in combined)
    assert client.get(f"{BASE}?branch=remote", headers=auth_headers).json() == []


@pytest.mark.parametrize(("query", "field"), [("status=xxx", "status"), ("branch=headquarters", "branch")])
def test_invalid_filter_is_400(client, auth_headers, query, field):
    res = client.get(f"{BASE}?{query}", headers=auth_headers)
    assert res.status_code == 400
    assert field_codes(res) == [(field, "invalid_choice")]


# --- Detalle ---


def test_summary_is_not_taken_as_an_id(client, auth_headers):
    assert client.get(f"{BASE}/summary", headers=auth_headers).status_code == 200


def test_get_existing_and_missing(client, auth_headers, seed_report):
    incident_id = open_ids(client, auth_headers)[0]
    assert client.get(f"{BASE}/{incident_id}", headers=auth_headers).json()["id"] == incident_id

    res = client.get(f"{BASE}/no-existe", headers=auth_headers)
    assert res.status_code == 404
    assert res.json() == {"detail": "Incidencia no encontrada", "code": "not_found"}


# --- Cambio de estado ---


def test_valid_transitions_update_updated_at(client, auth_headers, seed_report):
    incident_id = open_ids(client, auth_headers)[0]
    before = client.get(f"{BASE}/{incident_id}", headers=auth_headers).json()

    res = client.patch(f"{BASE}/{incident_id}/status", json={"status": "in_progress"}, headers=auth_headers)
    assert res.status_code == 200
    after = res.json()
    assert after["status"] == "in_progress"
    assert after["updated_at"] != before["updated_at"]
    assert after["created_at"] == before["created_at"]

    res = client.patch(f"{BASE}/{incident_id}/status", json={"status": "resolved"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"


def test_final_state_cannot_change(client, auth_headers, seed_report):
    incident_id = open_ids(client, auth_headers)[0]
    for status in ("in_progress", "resolved"):
        client.patch(f"{BASE}/{incident_id}/status", json={"status": status}, headers=auth_headers)

    res = client.patch(f"{BASE}/{incident_id}/status", json={"status": "open"}, headers=auth_headers)
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "invalid_transition"
    assert (body["from"], body["to"], body["allowed"]) == ("resolved", "open", [])
    assert "estado final" in body["detail"]


def test_open_cannot_jump_to_resolved(client, auth_headers, seed_report):
    incident_id = open_ids(client, auth_headers)[0]
    res = client.patch(f"{BASE}/{incident_id}/status", json={"status": "resolved"}, headers=auth_headers)
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "invalid_transition"
    assert (body["from"], body["to"], body["allowed"]) == ("open", "resolved", ["discarded", "in_progress"])
    # Sigue en open
    assert client.get(f"{BASE}/{incident_id}", headers=auth_headers).json()["status"] == "open"


def test_patch_invalid_status_value(client, auth_headers, seed_report):
    incident_id = open_ids(client, auth_headers)[0]
    res = client.patch(f"{BASE}/{incident_id}/status", json={"status": "closed"}, headers=auth_headers)
    assert res.status_code == 400
    assert field_codes(res) == [("status", "invalid_choice")]


def test_patch_missing_incident(client, auth_headers):
    res = client.patch(f"{BASE}/no-existe/status", json={"status": "in_progress"}, headers=auth_headers)
    assert res.status_code == 404
    assert res.json()["code"] == "not_found"


# --- Autenticación ---


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", BASE), ("get", f"{BASE}/summary"), ("post", BASE), ("get", f"{BASE}/x"), ("patch", f"{BASE}/x/status")],
)
def test_requires_token(client, method, path):
    kwargs = {"json": VALID} if method in ("post", "patch") else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401


# --- Errores no controlados ---


def test_unhandled_error_is_generic_500_with_cors(client, auth_headers, monkeypatch, caplog):
    def boom(**kwargs):
        raise RuntimeError("detalle interno secreto")

    monkeypatch.setattr(incidents_router, "list_incidents", boom)
    with caplog.at_level(logging.ERROR, logger="uvicorn.error"):
        res = client.get(BASE, headers={**auth_headers, "Origin": BACKOFFICE_ORIGIN})

    assert res.status_code == 500
    assert res.json() == {"detail": "Error interno del servidor", "code": "internal_error"}
    assert "secreto" not in res.text
    assert "Traceback" not in res.text
    # Por dentro de CORSMiddleware: el navegador puede leer el 500
    assert res.headers.get("access-control-allow-origin") == BACKOFFICE_ORIGIN
    # El traceback va al log del servidor
    assert "detalle interno secreto" in caplog.text
    assert any(record.exc_info for record in caplog.records)


# --- El resto de rutas conserva el 422 de FastAPI ---


def test_other_routes_keep_fastapi_422(client, auth_headers):
    res = client.post("/users", json={})
    assert res.status_code == 422
    assert isinstance(res.json()["detail"], list)
    assert "code" not in res.json()

    assert client.post("/users", json={"email": "x@example.com", "password": "123"}).status_code == 422
    assert client.post("/auth/login").status_code == 422
    assert client.put("/profiles/me", json={"foo": 1}, headers=auth_headers).status_code == 422


def test_analyzer_routes_unchanged(client, auth_headers):
    assert client.post(f"{BASE}/analyze", headers=auth_headers).status_code == 422
    assert client.get(f"{BASE}/results/export", headers=auth_headers).status_code == 404
