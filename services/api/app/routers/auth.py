"""Endpoints de autenticación: login con JWT, datos del usuario actual y contraseñas."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.auth_models import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    MeOut,
    MessageOut,
    Profile,
    ResetPasswordRequest,
    Token,
    UserUpdate,
)
from app.config import settings
from app.deps import get_current_user
from app.security import create_access_token, hash_password, verify_password
from app.services.email import send_password_reset_email
from app.services.password_reset import (
    consume_reset_token,
    create_reset_token,
    invalidate_reset_tokens,
)
from app.services.profiles import get_profile_by_user_id
from app.services.users import get_user_by_email, get_user_by_id, update_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

# Si el email no existe se verifica contra este hash igualmente, para que el tiempo
# de respuesta no delate qué emails están registrados
_DUMMY_HASH = hash_password("nexova-dummy-password")

FORGOT_PASSWORD_MESSAGE = "Si esa dirección está registrada, recibirás un enlace en breve"
INVALID_RESET_TOKEN = "El enlace no es válido o ha caducado. Solicita uno nuevo."


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


def _start_password_reset(email: str) -> None:
    """Genera el token y envía el enlace. Se ejecuta después de responder."""
    user = get_user_by_email(email)
    if user is None or not user["is_active"]:
        return
    token = create_reset_token(user["id"])
    reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    try:
        send_password_reset_email(user["email"], reset_url)
    except Exception:
        # Sin el enlace en el log: el token en claro no debe quedar escrito
        logger.exception("No se pudo enviar el email de recuperación al usuario %s", user["id"])


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(data: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    """Siempre 200 con el mismo mensaje. Todo el trabajo va en segundo plano, así que
    ni la respuesta ni su tiempo delatan si el email está registrado."""
    background_tasks.add_task(_start_password_reset, data.email)
    return MessageOut(message=FORGOT_PASSWORD_MESSAGE)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(data: ResetPasswordRequest):
    """400 si el token no existe, ha caducado o ya se usó, o si el usuario ya no está activo."""
    user_id = consume_reset_token(data.token)
    user = get_user_by_id(user_id) if user_id else None
    if user is None or not user["is_active"]:
        raise HTTPException(status_code=400, detail=INVALID_RESET_TOKEN)
    update_user(user["id"], UserUpdate(password=data.new_password))
    return MessageOut(message="Contraseña actualizada. Ya puedes iniciar sesión.")


@router.post("/change-password", response_model=MessageOut)
def change_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    """400 si la contraseña actual no es correcta (no 401: la sesión sigue siendo válida)."""
    if not verify_password(data.current_password, current_user["hashed_password"]):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")
    update_user(current_user["id"], UserUpdate(password=data.new_password))
    # Un enlace de recuperación pedido antes ya no debe poder cambiarla
    invalidate_reset_tokens(current_user["id"])
    return MessageOut(message="Contraseña cambiada correctamente.")
