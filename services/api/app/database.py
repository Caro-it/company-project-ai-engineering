"""Las dos bases de datos de la API.

- TinyDB (local): autenticación (usuarios, perfiles, tokens), proveedores e incidencias.
- Supabase (PostgreSQL, vía SQLModel): inventario (Asset, AssetEntry, AssetExit).

Ninguna tabla de usuarios se replica en Supabase: las órdenes guardan el UUID del
usuario de TinyDB en `user_uuid`.
"""
import os
from collections.abc import Iterator
from pathlib import Path
from threading import Lock

from sqlalchemy import event
from sqlalchemy.pool import NullPool, StaticPool
from sqlmodel import Session, SQLModel, create_engine
from tinydb import TinyDB
from tinydb.storages import JSONStorage

from app.config import settings


class LockedJSONStorage(JSONStorage):
    """JSONStorage con un lock por archivo.

    FastAPI ejecuta los endpoints síncronos en un pool de hilos y JSONStorage comparte un
    único descriptor de archivo: dos lecturas a la vez se mueven el cursor la una a la otra
    y json.load falla (JSONDecodeError → 500). Pasaba al cargar /incidencias, que pide el
    listado y el resumen en paralelo. Solo protege dentro de un proceso.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._lock = Lock()

    def read(self):
        with self._lock:
            return super().read()

    def write(self, data):
        with self._lock:
            super().write(data)


# services/api/data/ por defecto. NEXOVA_DATA_DIR permite usar otra carpeta
# (los tests e2e del backoffice arrancan la API con una BD temporal propia)
DATA_DIR = Path(
    os.environ.get("NEXOVA_DATA_DIR") or Path(__file__).resolve().parent.parent / "data"
)
DB_PATH = DATA_DIR / "suppliers.json"

db = TinyDB(
    DB_PATH,
    storage=LockedJSONStorage,
    create_dirs=True,
    encoding="utf-8",
    ensure_ascii=False,
    indent=2,
)

suppliers_table = db.table("suppliers")

# services/api/data/auth.json: usuarios y perfiles, separados de los proveedores
AUTH_DB_PATH = DATA_DIR / "auth.json"

auth_db = TinyDB(
    AUTH_DB_PATH,
    storage=LockedJSONStorage,
    create_dirs=True,
    encoding="utf-8",
    ensure_ascii=False,
    indent=2,
)

users_table = auth_db.table("users")
profiles_table = auth_db.table("profiles")
# Tokens de recuperación de contraseña: user_id, token_hash (sha256), expires_at, used_at
password_reset_tokens_table = auth_db.table("password_reset_tokens")

# services/api/data/incidents.json: gestor de incidencias
INCIDENTS_DB_PATH = DATA_DIR / "incidents.json"

incidents_db = TinyDB(
    INCIDENTS_DB_PATH,
    storage=LockedJSONStorage,
    create_dirs=True,
    encoding="utf-8",
    ensure_ascii=False,
    indent=2,
)

# id = uuid4 en string
incidents_table = incidents_db.table("incidents")
# Control de idempotencia del seed: ticket_id del CSV -> incident_id (no se guarda en la incidencia)
incident_seed_log_table = incidents_db.table("incident_seed_log")


# --- Supabase (PostgreSQL) · inventario --------------------------------------------


def _build_engine(url: str):
    if url.startswith("sqlite"):
        # Solo tests: SQLite en memoria compartida entre hilos (TestClient usa varios)
        sqlite_engine = create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )

        # SQLite no aplica las FK si no se le pide; PostgreSQL siempre las aplica
        @event.listens_for(sqlite_engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        return sqlite_engine
    # Supabase da la URI como postgresql://… y SQLAlchemy 2.1 la asocia por defecto a
    # psycopg 3. El proyecto usa psycopg2 (psycopg2-binary): se fija el driver aquí para
    # poder pegar la URI de Supabase tal cual en .env
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgresql://")
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgres://")
    # Supabase "Transaction pooler" (puerto 6543): el pooler ya reutiliza conexiones,
    # así que SQLAlchemy no mantiene un pool propio (NullPool). pool_pre_ping no hace
    # falta: cada sesión abre una conexión nueva.
    return create_engine(url, poolclass=NullPool)


engine = _build_engine(settings.DATABASE_URL)


def create_db_and_tables() -> None:
    """Crea en Supabase las tablas de inventario que aún no existan (no borra nada)."""
    # Importar los modelos los registra en SQLModel.metadata
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión por petición, cerrada al terminar."""
    with Session(engine) as session:
        yield session
