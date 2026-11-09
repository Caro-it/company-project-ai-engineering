"""Endpoints de usuarios: los 409 por email duplicado no repiten ni delatan el email."""
from app.services.users import get_user_by_email

# Mismas credenciales que el usuario de la fixture auth_headers (conftest.py)
OWNER = {"email": "qa@example.com", "password": "Password123"}
OTHER = {"email": "otra@example.com", "password": "Password123"}


def test_register_duplicate_email_is_neutral_409(client, auth_headers):
    res = client.post("/users", json=OWNER)
    assert res.status_code == 409
    assert res.json() == {"detail": "No se ha podido crear la cuenta con esos datos"}
    assert OWNER["email"] not in res.text


def test_update_to_taken_email_is_neutral_409(client, auth_headers):
    assert client.post("/users", json=OTHER).status_code == 201
    owner_id = get_user_by_email(OWNER["email"])["id"]

    res = client.put(f"/users/{owner_id}", json={"email": OTHER["email"]}, headers=auth_headers)
    assert res.status_code == 409
    assert res.json() == {"detail": "No se ha podido actualizar el email"}
    assert OTHER["email"] not in res.text
