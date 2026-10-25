"""Hash de contraseñas (bcrypt) y emisión de tokens JWT."""
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.hash import bcrypt  # libpass: fork mantenido y compatible de passlib

from app.config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Devuelve False también si el hash está corrupto o la contraseña supera 72 bytes."""
    try:
        return bcrypt.verify(plain, hashed)
    except ValueError:
        return False


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    claims = {"sub": user_id, "exp": expire}
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
