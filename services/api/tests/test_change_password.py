"""POST /auth/change-password: cuándo cambia la contraseña de un usuario autenticado."""
from app.services.password_reset import create_reset_token
from app.services.users import get_user_by_email

# Mismas credenciales que el usuario de la fixture auth_headers (conftest.py)
EMAIL = "qa@example.com"
PASSWORD = "Password123"
NEW_PASSWORD = "NuevaClave456"


def change(client, headers, current: str = PASSWORD, new: str = NEW_PASSWORD):
    return client.post(
        "/auth/change-password",
        json={"current_password": current, "new_password": new},
        headers=headers,
    )


def login_ok(client, password: str) -> bool:
    res = client.post("/auth/login", data={"username": EMAIL, "password": password})
    return res.status_code == 200


def test_cambio_con_contrasena_actual_correcta_cambia_la_contrasena(client, auth_headers):
    assert change(client, auth_headers).status_code == 200

    assert login_ok(client, NEW_PASSWORD)
    assert not login_ok(client, PASSWORD)


def test_cambio_a_contrasena_de_menos_de_8_caracteres_se_rechaza(client, auth_headers):
    assert change(client, auth_headers, new="corta77").status_code == 422

    assert login_ok(client, PASSWORD)
    assert not login_ok(client, "corta77")


def test_cambio_invalida_un_enlace_de_recuperacion_pedido_antes(client, auth_headers):
    reset_token = create_reset_token(get_user_by_email(EMAIL)["id"])
    assert change(client, auth_headers).status_code == 200

    res = client.post(
        "/auth/reset-password", json={"token": reset_token, "new_password": "DelEnlace789"}
    )

    assert res.status_code == 400
    assert login_ok(client, NEW_PASSWORD)
    assert not login_ok(client, "DelEnlace789")


def test_cambio_con_contrasena_actual_incorrecta_no_cambia_nada(client, auth_headers):
    res = change(client, auth_headers, current="NoEsLaMia000")

    # 400 y no 401: la sesión sigue siendo válida, lo incorrecto es el dato
    assert res.status_code == 400
    assert login_ok(client, PASSWORD)
    assert not login_ok(client, NEW_PASSWORD)


def test_cambio_sin_token_es_401_y_no_cambia_nada(client, auth_headers):
    assert change(client, headers={}).status_code == 401

    assert login_ok(client, PASSWORD)
    assert not login_ok(client, NEW_PASSWORD)
