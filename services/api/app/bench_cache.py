"""Mide cada lectura candidata con el caché vacío (miss) y lleno (hit). Proyecto Caching.

Uso (desde services/api, con la API configurada en .env):  uv run bench-cache
Pide email y contraseña de un usuario existente. No escribe nada en las bases de datos.
Usa el mismo X-Response-Time-ms que el middleware de timing (tiempo dentro de la API,
sin red cliente-servidor). Los números van a la tabla de CACHING_REPORT.md.
"""
import logging
import statistics
from getpass import getpass

from fastapi.testclient import TestClient
from sqlmodel import Session, func, select

from app import cache
from app.database import engine, incidents_table, suppliers_table
from app.main import app
from app.models import Asset, AssetEntry, AssetExit

CANDIDATES = [
    ("GET /api/incidents/summary (cacheado)", "/api/incidents/summary", None),
    ("GET /inventory/products (cacheado)", "/inventory/products", None),
    ("GET /inventory/products?office=Valencia (cacheado)", "/inventory/products", {"office": "Valencia"}),
    ("GET /api/incidents (no cacheado)", "/api/incidents", None),
    ("GET /inventory/orders (no cacheado)", "/inventory/orders", None),
    ("GET /suppliers (no cacheado)", "/suppliers", None),
]
REPETITIONS = 15


def main() -> None:
    logging.getLogger("api.timing").disabled = True
    email = input("Email: ").strip()
    password = getpass("Contraseña: ")
    with TestClient(app) as client:
        res = client.post("/auth/login", data={"username": email, "password": password})
        if res.status_code != 200:
            raise SystemExit("Login incorrecto")
        headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

        with Session(engine) as session:
            assets = session.exec(select(func.count()).select_from(Asset)).one()
            orders = (
                session.exec(select(func.count()).select_from(AssetEntry)).one()
                + session.exec(select(func.count()).select_from(AssetExit)).one()
            )
        print(
            f"Volumen: {len(incidents_table)} incidencias · {len(suppliers_table)} proveedores · "
            f"{assets} activos · {orders} órdenes\n"
        )
        print(f"{'Endpoint':52s} {'miss (ms)':>10s} {'hit (ms)':>10s}")
        for label, url, params in CANDIDATES:
            misses, hits = [], []
            for _ in range(REPETITIONS):
                cache.clear_all()
                for bucket in (misses, hits):
                    r = client.get(url, params=params, headers=headers)
                    r.raise_for_status()
                    bucket.append(float(r.headers["X-Response-Time-ms"]))
            print(f"{label:52s} {statistics.median(misses):10.1f} {statistics.median(hits):10.1f}")
        cache.clear_all()
    print(f"\nMedianas de {REPETITIONS} repeticiones. Los endpoints no cacheados dan miss ≈ hit.")


if __name__ == "__main__":
    main()
