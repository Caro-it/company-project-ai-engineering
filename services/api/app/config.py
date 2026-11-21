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
    # Inventario (Hito 5): cadena PostgreSQL de Supabase (Transaction pooler, URI).
    # Obligatoria como SECRET_KEY: sin ella la API no arranca
    DATABASE_URL: str

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Recuperación de contraseña (AUTH-03). Sin RESEND_API_KEY no se envían emails
    # (la API arranca igual y lo avisa en los logs)
    RESEND_API_KEY: str | None = None
    # Remitente de pruebas de Resend: solo entrega al email de la cuenta de Resend
    EMAIL_FROM: str = "Nexova <onboarding@resend.dev>"
    FRONTEND_URL: str = "http://localhost:3001"
    RESET_TOKEN_EXPIRE_MINUTES: int = 30

    # Orígenes permitidos por CORS (en .env, como lista JSON). Los tests e2e del
    # backoffice añaden su propio puerto
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Telemetría (proyecto de captura): URL pública del receptor de eventos. Hoy apunta al
    # stub POST /telemetry/events de esta misma API; en la fase de almacenamiento apuntará a
    # la implementación real. El backoffice usa la misma URL en NEXT_PUBLIC_TELEMETRY_ENDPOINT
    TELEMETRY_ENDPOINT: str = "http://localhost:8000/telemetry/events"

    # Cola de tareas (DEV-55): Redis como broker y como result backend de Celery. La API
    # (productor) y los workers (consumidores) usan la misma URL. En Docker: redis://redis:6379/0
    REDIS_URL: str = "redis://localhost:6379/0"
    # Solo tests (pytest y e2e del backoffice, sin Redis): la tarea se ejecuta dentro de la
    # petición. Nunca en desarrollo ni en producción
    CELERY_TASK_ALWAYS_EAGER: bool = False
    # Backoff de los reintentos: base · 2^reintento segundos (10, 20, 40 por defecto)
    TASK_RETRY_BASE_SECONDS: float = 10


settings = Settings()
