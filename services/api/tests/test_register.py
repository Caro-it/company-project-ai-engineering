"""POST /users (registro): quién puede crear una cuenta y cómo queda guardada.

El email duplicado ya está cubierto en test_users_api.py (409 neutro).
"""
from app.database import users_table
from app.security import verify_password
from app.services.users import get_user_by_email

EMAIL = "nueva@example.com"
PASSWORD = "Password123"


def register(client, **payload):
    return client.post("/users", json={"email": EMAIL, "password": PASSWORD, **payload})


def test_registro_valido_crea_usuario_activo_con_rol_user_y_hash(client):
    res = register(client)

    assert res.status_code == 201
    user = get_user_by_email(EMAIL)
    assert user is not None
    assert user["id"] == res.json()["id"]
    assert user["role"] == "user"
    assert user["is_active"] is True
    # En la BD nunca queda la contraseña en claro, pero el hash sí la verifica
    assert user["hashed_password"] != PASSWORD
    assert PASSWORD not in user["hashed_password"]
    assert verify_password(PASSWORD, user["hashed_password"])


def test_registro_contrasena_de_8_caracteres_se_acepta(client, login_ok):
    assert register(client, password="a" * 8).status_code == 201
    assert login_ok(EMAIL, "a" * 8)


def test_registro_contrasena_de_7_caracteres_se_rechaza(client):
    res = register(client, password="a" * 7)

    assert res.status_code == 422
    assert get_user_by_email(EMAIL) is None


def test_registro_email_en_mayusculas_se_guarda_en_minusculas(client, login_ok):
    assert register(client, email="Nueva.Persona@Example.COM").status_code == 201

    user = get_user_by_email("nueva.persona@example.com")
    assert user is not None
    assert user["email"] == "nueva.persona@example.com"
    assert login_ok("nueva.persona@example.com", PASSWORD)


def test_registro_con_rol_admin_se_rechaza_sin_crear_usuario(client):
    res = register(client, role="admin")

    assert res.status_code == 422
    assert users_table.all() == []


def test_registro_contrasena_de_mas_de_72_bytes_se_rechaza(client):
    # 37 caracteres pero 74 bytes en UTF-8: el límite de bcrypt es en bytes
    res = register(client, password="ñ" * 37)

    assert res.status_code == 422
    assert get_user_by_email(EMAIL) is None


def test_registro_contrasena_de_exactamente_72_bytes_se_acepta(client, login_ok):
    # Frontera del límite anterior: 36 "ñ" son 72 bytes justos
    assert register(client, password="ñ" * 36).status_code == 201
    assert login_ok(EMAIL, "ñ" * 36)
