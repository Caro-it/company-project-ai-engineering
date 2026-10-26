"""Modelos Pydantic de autenticación: usuarios, perfiles y tokens.

Documento User en TinyDB (data/auth.json, tabla users):
    id (uuid4 en string; otros módulos lo referencian como user_uuid),
    email, hashed_password, is_active, role, created_at (ISO UTC).
Los datos personales (name, phone, address) viven en la tabla profiles.
"""
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field

# bcrypt solo admite 72 bytes; bcrypt 5 lanza ValueError si se superan
PASSWORD_MAX_BYTES = 72


class Role(StrEnum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


def _check_password_bytes(value: str) -> str:
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"La contraseña no puede superar {PASSWORD_MAX_BYTES} bytes en UTF-8")
    return value


Password = Annotated[str, Field(min_length=8), AfterValidator(_check_password_bytes)]
Email = Annotated[EmailStr, AfterValidator(str.lower)]


class UserCreate(BaseModel):
    """Entrada de POST /users. El rol no se acepta: siempre es "user"."""
    model_config = ConfigDict(extra="forbid")
    email: Email
    password: Password
    name: str | None = None
    phone: str | None = None
    address: str | None = None


class UserUpdate(BaseModel):
    """Entrada de PUT /users/{id}. Solo un admin puede cambiar role o is_active."""
    model_config = ConfigDict(extra="forbid")
    email: Email | None = None
    password: Password | None = None
    role: Role | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    """Respuesta de la API: nunca incluye hashed_password."""
    id: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime


class Profile(BaseModel):
    id: str
    user_id: str
    name: str | None = None
    phone: str | None = None
    address: str | None = None


class ProfileUpdate(BaseModel):
    """Entrada de PUT /profiles/me."""
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    phone: str | None = None
    address: str | None = None


class MeOut(BaseModel):
    """Respuesta de GET /auth/me."""
    email: str
    role: Role
    profile: Profile | None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    """Entrada de POST /auth/forgot-password."""
    model_config = ConfigDict(extra="forbid")
    email: Email


class ResetPasswordRequest(BaseModel):
    """Entrada de POST /auth/reset-password. El token es el del enlace del email."""
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=1, max_length=256)
    new_password: Password


class ChangePasswordRequest(BaseModel):
    """Entrada de POST /auth/change-password (usuario autenticado)."""
    model_config = ConfigDict(extra="forbid")
    current_password: str
    new_password: Password


class MessageOut(BaseModel):
    """Respuesta con un mensaje para mostrar al usuario."""
    message: str
