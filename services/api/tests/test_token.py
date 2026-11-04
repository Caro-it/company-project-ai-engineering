"""GET /auth/me y validación del JWT (app/deps.py): qué tokens identifican a un usuario.

Cada token se construye a mano con jose.jwt. Los casos de rechazo comparan con el mismo
token "arreglado", para que el 401 se deba al defecto probado y no a otra cosa.
"""
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.auth_models import UserUpdate
from app.config import settings
from app.services.users import delete_user, get_user_by_email, update_user

EMAIL = "token@example.com"
PASSWORD = "Password123"


def register(client, **extra) -> str:
    payload = {"email": EMAIL, "password": PASSWORD, **extra}
    assert client.post("/users", json=payload).status_code == 201
    return get_user_by_email(EMAIL)["id"]


def make_token(claims: dict, key: str | None = None) -> str:
    return jwt.encode(claims, key or settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def future_exp() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=5)


def me(client, token: str | None):
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    return client.get("/auth/me", headers=headers)


def test_me_token_valido_devuelve_el_usuario_del_token(client):
    user_id = register(client, name="Ana Pérez")
    token = make_token({"sub": user_id, "exp": future_exp()})

    res = me(client, token)

    assert res.status_code == 200
    body = res.json()
    assert body["email"] == EMAIL
    assert body["role"] == "user"
    # El perfil es el vinculado a ese usuario, no otro cualquiera
    assert body["profile"]["user_id"] == user_id
    assert body["profile"]["name"] == "Ana Pérez"


def test_me_usuario_borrado_despues_es_401(client):
    user_id = register(client)
    token = make_token({"sub": user_id, "exp": future_exp()})
    assert me(client, token).status_code == 200

    assert delete_user(user_id)

    # La firma sigue siendo válida, pero el usuario ya no existe
    assert me(client, token).status_code == 401


def test_me_token_expirado_es_401(client):
    user_id = register(client)
    expired = make_token({"sub": user_id, "exp": datetime.now(timezone.utc) - timedelta(seconds=1)})
    fresh = make_token({"sub": user_id, "exp": future_exp()})

    assert me(client, expired).status_code == 401
    assert me(client, fresh).status_code == 200


def test_me_token_firmado_con_otra_clave_es_401(client):
    user_id = register(client)
    claims = {"sub": user_id, "exp": future_exp()}

    assert me(client, make_token(claims, key="otra-clave-que-no-es-la-buena")).status_code == 401
    assert me(client, make_token(claims)).status_code == 200


def test_me_token_malformado_o_sin_cabecera_es_401(client):
    user_id = register(client)

    assert me(client, "abc").status_code == 401
    assert me(client, None).status_code == 401
    # Control: el mismo endpoint sí responde con un token bien formado
    assert me(client, make_token({"sub": user_id, "exp": future_exp()})).status_code == 200


def test_me_token_sin_sub_es_401(client):
    user_id = register(client)

    assert me(client, make_token({"exp": future_exp()})).status_code == 401
    assert me(client, make_token({"sub": user_id, "exp": future_exp()})).status_code == 200


def test_me_usuario_desactivado_despues_del_login_es_401(client):
    register(client)
    login = client.post("/auth/login", data={"username": EMAIL, "password": PASSWORD})
    token = login.json()["access_token"]
    assert me(client, token).status_code == 200

    update_user(get_user_by_email(EMAIL)["id"], UserUpdate(is_active=False))

    assert me(client, token).status_code == 401


def test_me_token_sin_exp_es_401(client):
    user_id = register(client)
    # Firma correcta y usuario real: lo único que falta es la caducidad
    without_exp = make_token({"sub": user_id})
    with_exp = make_token({"sub": user_id, "exp": future_exp()})

    assert me(client, without_exp).status_code == 401
    assert me(client, with_exp).status_code == 200
