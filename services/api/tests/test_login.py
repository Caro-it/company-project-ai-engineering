"""POST /auth/login: qué credenciales obtienen un token y qué contiene ese token."""
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.auth_models import UserUpdate
from app.config import settings
from app.services.users import update_user

EMAIL = "login@example.com"
PASSWORD = "Password123"
GENERIC_ERROR = "Email o contraseña incorrectos"


def login(client, username: str = EMAIL, password: str = PASSWORD):
    return client.post("/auth/login", data={"username": username, "password": password})


def test_login_credenciales_correctas_emite_token_del_usuario(client, register_user):
    user_id = register_user(EMAIL, PASSWORD)
    before = datetime.now(timezone.utc)

    res = login(client)

    assert res.status_code == 200
    claims = jwt.decode(
        res.json()["access_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    assert claims["sub"] == user_id
    # exp es entero (segundos): margen de unos segundos por el redondeo y lo que tarda bcrypt
    expected_exp = before + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    exp = datetime.fromtimestamp(claims["exp"], timezone.utc)
    assert abs((exp - expected_exp).total_seconds()) < 10


def test_login_email_en_mayusculas_funciona(client, register_user):
    user_id = register_user(EMAIL, PASSWORD)

    res = login(client, username=EMAIL.upper())

    assert res.status_code == 200
    claims = jwt.decode(
        res.json()["access_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    assert claims["sub"] == user_id


def test_login_contrasena_vacia_no_emite_token(client, register_user):
    register_user(EMAIL, PASSWORD)

    res = login(client, password="")

    assert "access_token" not in res.json()


def test_login_contrasena_incorrecta_y_email_inexistente_dan_el_mismo_error(client, register_user):
    register_user(EMAIL, PASSWORD)

    wrong_password = login(client, password="OtraClave999")
    unknown_email = login(client, username="nadie@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 401
    # Mismo mensaje: la respuesta no delata qué emails están registrados
    assert wrong_password.json()["detail"] == unknown_email.json()["detail"] == GENERIC_ERROR
    assert "access_token" not in wrong_password.json()
    assert "access_token" not in unknown_email.json()


def test_login_usuario_desactivado_no_emite_token(client, register_user):
    user_id = register_user(EMAIL, PASSWORD)
    assert login(client).status_code == 200
    update_user(user_id, UserUpdate(is_active=False))

    res = login(client)

    assert res.status_code == 401
    assert "access_token" not in res.json()
    assert res.json()["detail"] == GENERIC_ERROR


def test_login_contrasena_de_mas_de_72_bytes_es_401_y_no_500(client, register_user):
    register_user(EMAIL, PASSWORD)
    too_long = "ñ" * 37  # 37 caracteres, 74 bytes en UTF-8: bcrypt lanzaría ValueError

    res = login(client, password=too_long)

    assert res.status_code == 401
    assert "access_token" not in res.json()
    # El fallo no deja la cuenta en mal estado: la contraseña correcta sigue entrando
    assert login(client).status_code == 200
