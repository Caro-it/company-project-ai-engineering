"""Fixtures comunes de los tests de la API.

TinyDB se sustituye por almacenamiento en memoria ANTES de importar app: los tests
nunca abren ni crean archivos en services/api/data/.
"""
import os
import sys
from pathlib import Path

import pytest
import tinydb
from tinydb.storages import MemoryStorage

# Valor fijo para que los tests no dependan de services/api/.env
os.environ["SECRET_KEY"] = "test-secret-key-solo-para-tests"

_TinyDB = tinydb.TinyDB
tinydb.TinyDB = lambda *args, **kwargs: _TinyDB(storage=MemoryStorage)

REPO_ROOT = Path(__file__).resolve().parents[3]
# scripts/seed_incidents.py no es un paquete instalado: se importa desde su carpeta
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

from app import database  # noqa: E402
from app.main import app  # noqa: E402

CSV_PATH = REPO_ROOT / "scripts" / "incidents-nexova.csv"


@pytest.fixture(autouse=True)
def clean_db():
    """Cada test empieza con todas las tablas vacías."""
    for db in (database.db, database.auth_db, database.incidents_db):
        db.drop_tables()
    yield


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False: los 500 llegan como respuesta, como en el navegador
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    """Usuario real en la BD en memoria y su token."""
    credentials = {"email": "qa@example.com", "password": "Password123"}
    assert client.post("/users", json=credentials).status_code == 201
    res = client.post(
        "/auth/login",
        data={"username": credentials["email"], "password": credentials["password"]},
    )
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture
def seed():
    """Función que carga el CSV del analizador en la BD en memoria y devuelve el informe."""
    import seed_incidents
    from incidents_core.validation import load_csv

    rows = load_csv(CSV_PATH)
    return lambda: seed_incidents.run(
        rows, database.incidents_table, database.incident_seed_log_table
    )


@pytest.fixture
def seed_report(seed) -> dict:
    """Informe de una primera carga del CSV."""
    return seed()
