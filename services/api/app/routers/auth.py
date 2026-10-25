"""Endpoints de autenticación: login con JWT y datos del usuario actual."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.auth_models import MeOut, Profile, Token
from app.deps import get_current_user
from app.security import create_access_token, hash_password, verify_password
from app.services.profiles import get_profile_by_user_id
from app.services.users import get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])

# Si el email no existe se verifica contra este hash igualmente, para que el tiempo
# de respuesta no delate qué emails están registrados
_DUMMY_HASH = hash_password("nexova-dummy-password")


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """El campo username del formulario es el email (compatible con Authorize de /docs)."""
    user = get_user_by_email(form_data.username)
    password_ok = verify_password(
        form_data.password,
        user["hashed_password"] if user else _DUMMY_HASH,
    )
    if user is None or not password_ok or not user["is_active"]:
        # Mensaje genérico: no revela si el email existe
        raise HTTPException(
            status_code=401,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user["id"]))


@router.get("/me", response_model=MeOut)
def read_me(current_user: dict = Depends(get_current_user)):
    profile = get_profile_by_user_id(current_user["id"])
    return MeOut(
        email=current_user["email"],
        role=current_user["role"],
        profile=Profile(**profile) if profile else None,
    )
