"""Acceso a la tabla password_reset_tokens (data/auth.json).

Solo se guarda el hash sha256 del token: el token en claro únicamente viaja en el
enlace del email. Un token vale una vez y caduca a los RESET_TOKEN_EXPIRE_MINUTES.
"""
import hashlib
import secrets
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from threading import Lock

from tinydb import Query

from app.config import settings
from app.database import password_reset_tokens_table

T = Query()

# Igual que en users.py: evita que dos peticiones simultáneas usen el mismo token
_write_lock = Lock()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _invalidate_pending(user_id: str, now: datetime) -> None:
    """Sin lock: quien llama debe tener _write_lock."""
    password_reset_tokens_table.update(
        {"used_at": now.isoformat()},
        (T.user_id == user_id) & (T.used_at == None),  # noqa: E711 (sintaxis de TinyDB)
    )


def invalidate_reset_tokens(user_id: str) -> None:
    """Marca como usados los tokens pendientes del usuario."""
    with _write_lock:
        _invalidate_pending(user_id, _now())


def create_reset_token(user_id: str) -> str:
    """Invalida los tokens pendientes del usuario y devuelve uno nuevo en claro."""
    token = secrets.token_urlsafe(32)
    now = _now()
    with _write_lock:
        _invalidate_pending(user_id, now)
        password_reset_tokens_table.insert({
            "user_id": user_id,
            "token_hash": _hash_token(token),
            "expires_at": (now + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)).isoformat(),
            "used_at": None,
        })
    return token


def consume_reset_token(token: str, apply: Callable[[str], bool]) -> bool:
    """Si el token es válido, llama a apply(user_id) y, solo si devuelve True, marca
    el token como usado.

    Se marca DESPUÉS de aplicar el cambio: si apply falla (lanza o devuelve False), el
    enlace sigue sirviendo. Todo va dentro del lock para que dos peticiones simultáneas
    no usen el mismo token. False si el token no existe, ha caducado o ya se usó.
    """
    token_hash = _hash_token(token)
    now = _now()
    with _write_lock:
        doc = password_reset_tokens_table.get(T.token_hash == token_hash)
        if (
            doc is None
            or doc["used_at"] is not None
            or datetime.fromisoformat(doc["expires_at"]) <= now
        ):
            return False
        if not apply(doc["user_id"]):
            return False
        password_reset_tokens_table.update({"used_at": now.isoformat()}, T.token_hash == token_hash)
    return True
