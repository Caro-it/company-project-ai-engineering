"""Inicialización de TinyDB para el Directorio de Proveedores y la autenticación."""
from pathlib import Path

from tinydb import TinyDB

# services/api/data/suppliers.json
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "suppliers.json"

db = TinyDB(
    DB_PATH,
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
    create_dirs=True,
    encoding="utf-8",
    ensure_ascii=False,
    indent=2,
)

users_table = auth_db.table("users")
profiles_table = auth_db.table("profiles")
# Tokens de recuperación de contraseña: user_id, token_hash (sha256), expires_at, used_at
password_reset_tokens_table = auth_db.table("password_reset_tokens")
