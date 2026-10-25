"""Acceso a la tabla profiles (data/auth.json).

Un perfil por usuario, vinculado por user_id. No lanza HTTPException:
si el perfil no existe devuelve None o False y el router decide el código.
"""
from uuid import uuid4

from tinydb import Query

from app.auth_models import ProfileUpdate
from app.database import profiles_table

P = Query()


def create_profile(
    user_id: str,
    name: str | None = None,
    phone: str | None = None,
    address: str | None = None,
) -> dict:
    doc = {
        "id": str(uuid4()),
        "user_id": user_id,
        "name": name,
        "phone": phone,
        "address": address,
    }
    profiles_table.insert(doc)
    return doc


def get_profile_by_user_id(user_id: str) -> dict | None:
    doc = profiles_table.get(P.user_id == user_id)
    return dict(doc) if doc is not None else None


def update_profile(user_id: str, data: ProfileUpdate) -> dict | None:
    """Actualiza solo los campos enviados; un null explícito vacía el campo."""
    if get_profile_by_user_id(user_id) is None:
        return None
    changes = data.model_dump(exclude_unset=True)
    if changes:
        profiles_table.update(changes, P.user_id == user_id)
    return get_profile_by_user_id(user_id)


def delete_profile_by_user_id(user_id: str) -> bool:
    return bool(profiles_table.remove(P.user_id == user_id))
