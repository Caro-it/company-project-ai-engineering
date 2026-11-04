"""POST /auth/forgot-password + POST /auth/reset-password: quién recibe un enlace y
cuándo sirve ese enlace para cambiar la contraseña.

El envío real se sustituye en app.routers.auth (donde se usa). El TestClient ejecuta
las BackgroundTasks al terminar la petición, así que el "email" ya está capturado al
volver de client.post. Ya cubierto en test_error_handling.py: si falla el cambio de
contraseña, el token sigue valiendo.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from tinydb import Query

from app.auth_models import UserUpdate
from app.database import password_reset_tokens_table
from app.services.users import get_user_by_email, update_user

EMAIL = "reset@example.com"
OLD_PASSWORD = "Password123"
NEW_PASSWORD = "NuevaClave456"


@pytest.fixture
def sent_emails(monkeypatch) -> list[dict]:
    """Cada llamada a send_password_reset_email queda aquí en vez de enviarse."""
    sent: list[dict] = []
    monkeypatch.setattr(
        "app.routers.auth.send_password_reset_email",
        lambda to, reset_url: sent.append({"to": to, "url": reset_url}),
    )
    return sent


@pytest.fixture
def user_id(client) -> str:
    res = client.post("/users", json={"email": EMAIL, "password": OLD_PASSWORD})
    assert res.status_code == 201
    return res.json()["id"]


def token_from(email: dict) -> str:
    return parse_qs(urlparse(email["url"]).query)["token"][0]


def request_link(client, sent_emails, email: str = EMAIL) -> str:
    client.post("/auth/forgot-password", json={"email": email})
    return token_from(sent_emails[-1])


def reset(client, token: str, new_password: str = NEW_PASSWORD):
    return client.post("/auth/reset-password", json={"token": token, "new_password": new_password})


def login_ok(client, password: str) -> bool:
    res = client.post("/auth/login", data={"username": EMAIL, "password": password})
    return res.status_code == 200


def test_reset_flujo_completo_cambia_la_contrasena(client, sent_emails, user_id):
    res = client.post("/auth/forgot-password", json={"email": EMAIL})

    assert res.status_code == 200
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == EMAIL
    token = token_from(sent_emails[0])

    assert reset(client, token).status_code == 200
    assert not login_ok(client, OLD_PASSWORD)
    assert login_ok(client, NEW_PASSWORD)


def test_reset_dos_enlaces_seguidos_solo_vale_el_ultimo(client, sent_emails, user_id):
    first = request_link(client, sent_emails)
    last = request_link(client, sent_emails)

    assert reset(client, first).status_code == 400
    assert login_ok(client, OLD_PASSWORD)
    assert reset(client, last).status_code == 200
    assert login_ok(client, NEW_PASSWORD)


def test_reset_email_no_registrado_misma_respuesta_y_no_envia(client, sent_emails, user_id):
    registered = client.post("/auth/forgot-password", json={"email": EMAIL})
    unknown = client.post("/auth/forgot-password", json={"email": "nadie@example.com"})

    assert registered.status_code == unknown.status_code == 200
    assert registered.json() == unknown.json()
    # Solo se ha "enviado" el del email registrado
    assert [email["to"] for email in sent_emails] == [EMAIL]


def test_reset_token_reutilizado_falla_la_segunda_vez(client, sent_emails, user_id):
    token = request_link(client, sent_emails)
    assert reset(client, token).status_code == 200

    res = reset(client, token, new_password="TerceraClave789")

    assert res.status_code == 400
    # La segunda petición no ha cambiado nada: sigue valiendo la del primer reset
    assert login_ok(client, NEW_PASSWORD)
    assert not login_ok(client, "TerceraClave789")


def test_reset_token_caducado_falla(client, sent_emails, user_id):
    token = request_link(client, sent_emails)
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    password_reset_tokens_table.update({"expires_at": past}, Query().user_id == user_id)

    assert reset(client, token).status_code == 400
    assert login_ok(client, OLD_PASSWORD)


def test_reset_token_inventado_falla(client, sent_emails, user_id):
    assert reset(client, "token-que-nunca-se-ha-emitido").status_code == 400
    assert login_ok(client, OLD_PASSWORD)


def test_reset_email_en_mayusculas_recibe_el_enlace(client, sent_emails, user_id):
    client.post("/auth/forgot-password", json={"email": EMAIL.upper()})

    assert [email["to"] for email in sent_emails] == [EMAIL]


def test_reset_usuario_desactivado_no_recibe_enlace(client, sent_emails, user_id):
    update_user(user_id, UserUpdate(is_active=False))

    res = client.post("/auth/forgot-password", json={"email": EMAIL})

    assert res.status_code == 200
    assert sent_emails == []


def test_reset_usuario_desactivado_despues_de_pedir_el_enlace_falla(client, sent_emails, user_id):
    token = request_link(client, sent_emails)
    update_user(user_id, UserUpdate(is_active=False))
    hash_before = get_user_by_email(EMAIL)["hashed_password"]

    assert reset(client, token).status_code == 400
    # Ni cambia la contraseña guardada ni se gasta el enlace
    assert get_user_by_email(EMAIL)["hashed_password"] == hash_before
    doc = password_reset_tokens_table.get(Query().user_id == user_id)
    assert doc["used_at"] is None
