"""Configuración de la API leída de services/api/.env."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/api/.env (independiente del directorio desde el que se arranque)
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Obligatoria: sin valor por defecto, la API no arranca si falta
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Recuperación de contraseña (AUTH-03). Sin RESEND_API_KEY no se envían emails
    # (la API arranca igual y lo avisa en los logs)
    RESEND_API_KEY: str | None = None
    # Remitente de pruebas de Resend: solo entrega al email de la cuenta de Resend
    EMAIL_FROM: str = "Nexova <onboarding@resend.dev>"
    FRONTEND_URL: str = "http://localhost:3001"
    RESET_TOKEN_EXPIRE_MINUTES: int = 30


settings = Settings()
