"""Perfil del usuario autenticado (/profiles/me, API-042): cada usuario ve y edita solo
el suyo, y solo cambian los campos enviados."""
from app.services.profiles import delete_profile_by_user_id, get_profile_by_user_id
from app.services.users import get_user_by_email

BASE = "/profiles/me"
# Mismo email que el usuario de la fixture auth_headers (conftest.py)
OWNER_EMAIL = "qa@example.com"


def owner_profile() -> dict | None:
    return get_profile_by_user_id(get_user_by_email(OWNER_EMAIL)["id"])


def other_user(client) -> str:
    payload = {"email": "otra@example.com", "password": "Password123", "name": "Otra Persona"}
    assert client.post("/users", json=payload).status_code == 201
    return get_user_by_email("otra@example.com")["id"]


# --- GET /profiles/me ---


def test_perfil_devuelve_el_del_usuario_del_token(client, auth_headers):
    other_user(client)

    res = client.get(BASE, headers=auth_headers)

    assert res.status_code == 200
    assert res.json()["user_id"] == get_user_by_email(OWNER_EMAIL)["id"]
    # El registro de la fixture no manda nombre: no es el perfil de la otra usuaria
    assert res.json()["name"] is None


def test_perfil_inexistente_es_404(client, auth_headers):
    assert delete_profile_by_user_id(get_user_by_email(OWNER_EMAIL)["id"])

    assert client.get(BASE, headers=auth_headers).status_code == 404


def test_perfil_sin_token_es_401(client):
    assert client.get(BASE).status_code == 401


# --- PUT /profiles/me ---


def test_editar_perfil_guarda_los_campos_enviados(client, auth_headers):
    res = client.put(
        BASE, json={"name": "Ana Pérez", "phone": "+34 600 000 000"}, headers=auth_headers
    )

    assert res.status_code == 200
    profile = owner_profile()
    assert profile["name"] == "Ana Pérez"
    assert profile["phone"] == "+34 600 000 000"


def test_editar_perfil_solo_cambia_los_campos_enviados(client, auth_headers):
    client.put(BASE, json={"name": "Ana", "address": "Calle Mayor 1"}, headers=auth_headers)

    client.put(BASE, json={"phone": "600"}, headers=auth_headers)

    profile = owner_profile()
    assert (profile["name"], profile["phone"], profile["address"]) == ("Ana", "600", "Calle Mayor 1")


def test_editar_perfil_con_null_explicito_vacia_el_campo(client, auth_headers):
    client.put(BASE, json={"name": "Ana", "phone": "600"}, headers=auth_headers)

    client.put(BASE, json={"phone": None}, headers=auth_headers)

    profile = owner_profile()
    assert profile["phone"] is None
    assert profile["name"] == "Ana"


def test_editar_perfil_no_toca_el_de_otro_usuario(client, auth_headers):
    other_id = other_user(client)

    client.put(BASE, json={"name": "Cambiado"}, headers=auth_headers)

    assert get_profile_by_user_id(other_id)["name"] == "Otra Persona"


def test_editar_perfil_no_permite_reasignarlo_a_otro_usuario(client, auth_headers):
    other_id = other_user(client)
    profile_before = owner_profile()

    res = client.put(BASE, json={"user_id": other_id, "name": "Intruso"}, headers=auth_headers)

    assert res.status_code == 422
    assert owner_profile() == profile_before
    assert get_profile_by_user_id(other_id)["name"] == "Otra Persona"


def test_editar_perfil_inexistente_es_404_y_no_lo_crea(client, auth_headers):
    delete_profile_by_user_id(get_user_by_email(OWNER_EMAIL)["id"])

    res = client.put(BASE, json={"name": "Ana"}, headers=auth_headers)

    assert res.status_code == 404
    assert owner_profile() is None


def test_editar_perfil_sin_token_es_401_y_no_cambia_nada(client, auth_headers):
    profile_before = owner_profile()

    assert client.put(BASE, json={"name": "Sin sesión"}).status_code == 401
    assert owner_profile() == profile_before
