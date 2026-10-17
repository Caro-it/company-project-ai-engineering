"""Inicialización de TinyDB para el Directorio de Proveedores."""
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