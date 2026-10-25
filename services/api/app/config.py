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


settings = Settings()
