"""Endpoints de usuarios: alta pública y gestión protegida (propio usuario o admin)."""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth_models import Role, UserCreate, UserOut, UserUpdate
from app.deps import get_current_user, require_self_or_admin
from app.services.users import (
    EmailAlreadyExistsError,
    create_user,
    delete_user,
    get_user_by_id,
    list_users,
    update_user,
)

router = APIRouter(prefix="/users", tags=["users"])

# Campos que solo un admin puede modificar
ADMIN_ONLY_FIELDS = {"role", "is_active"}


def _to_user_out(doc: dict) -> UserOut:
    """Convierte el documento de TinyDB en la respuesta (sin hashed_password)."""
    return UserOut(
        id=doc["id"],
        email=doc["email"],
        role=doc["role"],
        is_active=doc["is_active"],
        created_at=doc["created_at"],
    )


def _not_found(user_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Usuario {user_id} no encontrado")


@router.post("", response_model=UserOut, status_code=201)
def register_user(payload: UserCreate):
    """Alta pública. El rol siempre es "user"."""
    try:
        user = create_user(payload, role=Role.USER)
    except EmailAlreadyExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    return _to_user_out(user)


@router.get("", response_model=list[UserOut])
def read_users(current_user: dict = Depends(get_current_user)):
    return [_to_user_out(doc) for doc in list_users()]


@router.get("/{user_id}", response_model=UserOut)
def read_user(user_id: str, current_user: dict = Depends(get_current_user)):
    # Permiso antes que existencia: un no-admin recibe 403 aunque el id no exista
    require_self_or_admin(user_id, current_user)
    user = get_user_by_id(user_id)
    if user is None:
        raise _not_found(user_id)
    return _to_user_out(user)


@router.put("/{user_id}", response_model=UserOut)
def edit_user(user_id: str, payload: UserUpdate, current_user: dict = Depends(get_current_user)):
    require_self_or_admin(user_id, current_user)
    if current_user["role"] != Role.ADMIN and ADMIN_ONLY_FIELDS & payload.model_fields_set:
        raise HTTPException(status_code=403, detail="Solo un admin puede cambiar role o is_active")

    try:
        user = update_user(user_id, payload)
    except EmailAlreadyExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from None
    if user is None:
        raise _not_found(user_id)
    return _to_user_out(user)


@router.delete("/{user_id}", status_code=204)
def remove_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Borra el usuario y su perfil."""
    require_self_or_admin(user_id, current_user)
    if not delete_user(user_id):
        raise _not_found(user_id)
    return Response(status_code=204)
