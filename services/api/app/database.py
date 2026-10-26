"""Inicialización de TinyDB para el Directorio de Proveedores, la autenticación y las incidencias."""
from pathlib import Path
from threading import Lock

from tinydb import TinyDB
from tinydb.storages import JSONStorage


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


# services/api/data/suppliers.json
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
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
