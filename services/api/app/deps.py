"""Dependencias de autenticación y autorización para los routers."""
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.auth_models import Role
from app.config import settings
from app.services.users import get_user_by_id

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Devuelve el usuario del token. Cualquier fallo es un 401 sin más detalle."""
    credentials_error = HTTPException(
        status_code=401,
        detail="No se han podido validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # JWTError incluye ExpiredSignatureError (token caducado)
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise credentials_error from None

    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise credentials_error

    user = get_user_by_id(user_id)
    if user is None or not user.get("is_active"):
        raise credentials_error
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """403 si el usuario autenticado no es admin."""
    if current_user["role"] != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Solo un admin puede acceder a este recurso")
    return current_user


def require_self_or_admin(target_id: str, current_user: dict) -> None:
    """403 si el usuario autenticado no es el dueño del recurso ni admin."""
    if current_user["id"] != target_id and current_user["role"] != Role.ADMIN:
        raise HTTPException(status_code=403, detail="No tienes permiso para acceder a este usuario")
