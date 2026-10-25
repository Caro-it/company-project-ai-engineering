"""Acceso a la tabla users (data/auth.json).

Los usuarios se identifican por "id" (uuid4 en string), no por el doc_id de TinyDB.
No lanza HTTPException: los errores de negocio son excepciones propias que el
router traduce (EmailAlreadyExistsError → 409).
"""
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from tinydb import Query

from app.auth_models import Role, UserCreate, UserUpdate
from app.database import users_table
from app.security import hash_password
from app.services.profiles import create_profile, delete_profile_by_user_id

U = Query()

# TinyDB no es thread-safe y FastAPI ejecuta los endpoints síncronos en un pool de
# hilos: el lock evita que dos altas simultáneas con el mismo email pasen la comprobación
_write_lock = Lock()


class EmailAlreadyExistsError(Exception):
    """Ya existe un usuario con ese email."""

    def __init__(self, email: str):
        super().__init__(f"Ya existe un usuario con el email {email}")
        self.email = email


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user_by_id(user_id: str) -> dict | None:
    doc = users_table.get(U.id == user_id)
    return dict(doc) if doc is not None else None


def get_user_by_email(email: str) -> dict | None:
    doc = users_table.get(U.email == email.lower())
    return dict(doc) if doc is not None else None


def list_users() -> list[dict]:
    return [dict(doc) for doc in users_table.all()]


def create_user(data: UserCreate, role: Role = Role.USER) -> dict:
    """Crea el usuario y su perfil vinculado; si falla el perfil, borra el usuario."""
    with _write_lock:
        if get_user_by_email(data.email) is not None:
            raise EmailAlreadyExistsError(data.email)

        user = {
            "id": str(uuid4()),
            "email": data.email,
            "hashed_password": hash_password(data.password),
            "is_active": True,
            "role": role.value,
            "created_at": _now(),
        }
        users_table.insert(user)

        try:
            create_profile(user["id"], name=data.name, phone=data.phone, address=data.address)
        except Exception:
            # Sin perfil no hay usuario: no dejar huérfanos
            users_table.remove(U.id == user["id"])
            raise

    return user


def update_user(user_id: str, data: UserUpdate) -> dict | None:
    """Actualiza los campos enviados (los null se ignoran). None si el usuario no existe.

    El control de quién puede cambiar role o is_active es del router.
    """
    changes = data.model_dump(mode="json", exclude_none=True)

    with _write_lock:
        if get_user_by_id(user_id) is None:
            return None

        if "email" in changes:
            existing = get_user_by_email(changes["email"])
            if existing is not None and existing["id"] != user_id:
                raise EmailAlreadyExistsError(changes["email"])

        if "password" in changes:
            changes["hashed_password"] = hash_password(changes.pop("password"))

        if changes:
            users_table.update(changes, U.id == user_id)

    return get_user_by_id(user_id)


def delete_user(user_id: str) -> bool:
    """Borra el usuario y su perfil. False si el usuario no existe."""
    with _write_lock:
        if not users_table.remove(U.id == user_id):
            return False
        delete_profile_by_user_id(user_id)
    return True
