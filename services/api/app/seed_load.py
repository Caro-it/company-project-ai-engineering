"""Carga realista para medir el caching (proyecto Caching). NO es el seed del BRIEFING.

Con los ~30 registros del seed normal todo responde en pocos ms y el middleware de
timing no enseña dónde merece la pena cachear. Este script mete volumen con datos
variados y coherentes para que filtros y agregaciones cuesten trabajo de verdad.

Uso (desde services/api):
  uv run seed-load                      # 5000 incidencias + 300 activos con ~8000 órdenes
  uv run seed-load --incidents 10000 --assets 500 --orders-per-asset 40
  uv run seed-load --purge              # borra SOLO lo creado por este script

Todo lo creado lleva marca para poder borrarlo sin tocar los datos reales:
- Incidencias: título empieza por "[LOAD] " (TinyDB, data/incidents.json).
- Activos: SKU empieza por "LOAD-" (Supabase); sus órdenes se borran con ellos.

⚠️ Escribe en la base de datos configurada en services/api/.env (tu Supabase). Las
órdenes necesitan un user_uuid real: usa el primer admin activo (uv run create-admin).
"""
import argparse
import random
import sys
from datetime import UTC, datetime, timedelta
from typing import get_args
from uuid import uuid4

from incidents_core.incident_model import ALLOWED_TRANSITIONS, Branch, Category, Origin
from sqlmodel import Session, col, delete, select
from tinydb import Query

from app.auth_models import Role
from app.database import create_db_and_tables, engine, incidents_table, users_table
from app.inventory_catalog import AssetCategory, ExitType, Office
from app.models import Asset, AssetEntry, AssetExit

LOAD_TITLE_PREFIX = "[LOAD] "
LOAD_SKU_PREFIX = "LOAD-"

# Textos variados para que no sean quinientas filas "test" idénticas
INCIDENT_TOPICS = {
    "technical_failure": ["El ATS no carga", "Caída del VPN", "Error 500 en el portal de candidatos", "El correo no sincroniza"],
    "process_error": ["Oferta enviada sin aprobación", "Contrato con fecha de alta errónea", "Duplicado en la nómina"],
    "client_complaint": ["Cliente se queja del plazo de la terna", "Factura con importe incorrecto", "Cliente no recibe informes"],
    "candidate_issue": ["Candidato no recibe la prueba técnica", "Entrevista sin confirmar", "Candidato pide borrar sus datos"],
    "staff_issue": ["Baja no comunicada", "Conflicto en el equipo de selección", "Falta de cobertura en turno"],
    "sla_breach": ["SLA de primera respuesta superado", "Terna entregada fuera de plazo"],
    "data_quality": ["CVs duplicados en la base", "Emails de candidatos mal formados", "Sedes mal asignadas"],
    "other": ["Consulta general", "Petición de material de oficina"],
}
ASSET_NAMES = {
    AssetCategory.HARDWARE: ['Portátil 14" Business', "Monitor 27\" QHD", "Docking station", "Teléfono IP"],
    AssetCategory.PERIPHERALS: ["Ratón ergonómico", "Teclado inalámbrico", "Hub USB-C", "Auriculares con micro"],
    AssetCategory.OFFICE_SUPPLIES: ["Resma de papel A4", "Pack de bolígrafos", "Archivador A-Z", "Post-it 76x76"],
    AssetCategory.TRAINING_MATERIALS: ["Cuaderno de liderazgo", "Manual de entrevistas por competencias", "Guía de onboarding"],
}
SUPPLIERS = {
    Office.VALENCIA: ["TechDistrib Valencia S.L.", "Papelería Levante S.L.", "Ofimática Turia"],
    Office.MIAMI: ["Office Depot Miami", "Brickell Tech Supply", "Coral Gables Paper Co."],
}
EMPLOYEES = ["Lucía Ferrer", "Daniel Ortiz", "Marta Llopis", "Kevin Ramos", "Ana Beltrán", "Sofía Pérez"]


def _admin_uuid() -> str:
    for user in users_table.all():
        if user.get("role") == Role.ADMIN and user.get("is_active"):
            return user["id"]
    sys.exit("No hay ningún admin activo en TinyDB. Créalo antes con: uv run create-admin")


def _random_status(rng: random.Random) -> str:
    # Recorrido válido de ALLOWED_TRANSITIONS: open → in_progress → resolved / discarded
    status = "open"
    while ALLOWED_TRANSITIONS[status] and rng.random() < 0.6:
        status = rng.choice(sorted(ALLOWED_TRANSITIONS[status]))
    return status


def seed_incidents(count: int, rng: random.Random) -> int:
    now = datetime.now(UTC)
    docs = []
    for _ in range(count):
        category = rng.choice(get_args(Category))
        created = now - timedelta(days=rng.randint(0, 365), minutes=rng.randint(0, 1440))
        updated = created + timedelta(hours=rng.randint(0, 72))
        docs.append(
            {
                "id": str(uuid4()),
                "title": LOAD_TITLE_PREFIX + rng.choice(INCIDENT_TOPICS[category]),
                "description": f"Registro de carga #{rng.randint(1000, 99999)} para medir rendimiento.",
                "category": category,
                "origin": rng.choice(get_args(Origin)),
                "branch": rng.choice(get_args(Branch)),
                "status": _random_status(rng),
                "created_at": created.isoformat(),
                "updated_at": min(updated, now).isoformat(),
            }
        )
    incidents_table.insert_multiple(docs)  # una sola escritura del JSON
    return len(docs)


def seed_inventory(asset_count: int, orders_per_asset: int, user_uuid: str, rng: random.Random) -> dict:
    created = {"assets": 0, "entries": 0, "exits": 0}
    now = datetime.now(UTC)
    with Session(engine) as session:
        start = session.exec(select(Asset).where(col(Asset.sku).startswith(LOAD_SKU_PREFIX))).all()
        offset = len(start)
        assets = []
        for i in range(asset_count):
            category = rng.choice(list(AssetCategory))
            office = rng.choice(list(Office))
            assets.append(
                Asset(
                    name=rng.choice(ASSET_NAMES[category]),
                    sku=f"{LOAD_SKU_PREFIX}{offset + i + 1:05d}",
                    category=category.value,
                    office=office.value,
                )
            )
        session.add_all(assets)
        session.commit()
        for asset in assets:
            session.refresh(asset)
        created["assets"] = len(assets)

        for asset in assets:
            stock = 0
            for _ in range(rng.randint(orders_per_asset // 2, orders_per_asset * 3 // 2)):
                when = now - timedelta(days=rng.randint(0, 365))
                # 60 % entradas; una salida nunca deja el stock en negativo
                if stock == 0 or rng.random() < 0.6:
                    qty = rng.randint(1, 20)
                    stock += qty
                    session.add(
                        AssetEntry(
                            asset_id=asset.id, quantity=qty, office=asset.office,
                            supplier=rng.choice(SUPPLIERS[Office(asset.office)]),
                            created_at=when, user_uuid=user_uuid,
                        )
                    )
                    created["entries"] += 1
                else:
                    qty = rng.randint(1, stock)
                    stock -= qty
                    exit_type = rng.choice(list(ExitType))
                    session.add(
                        AssetExit(
                            asset_id=asset.id, quantity=qty, office=asset.office,
                            exit_type=exit_type.value,
                            assigned_to=rng.choice(EMPLOYEES) if exit_type == ExitType.ALLOCATION else None,
                            created_at=when, user_uuid=user_uuid,
                        )
                    )
                    created["exits"] += 1
        session.commit()
    return created


def purge() -> dict:
    removed = {"incidents": len(incidents_table.remove(Query().title.test(lambda t: isinstance(t, str) and t.startswith(LOAD_TITLE_PREFIX))))}
    with Session(engine) as session:
        ids = session.exec(select(Asset.id).where(col(Asset.sku).startswith(LOAD_SKU_PREFIX))).all()
        if ids:
            session.exec(delete(AssetEntry).where(col(AssetEntry.asset_id).in_(ids)))
            session.exec(delete(AssetExit).where(col(AssetExit.asset_id).in_(ids)))
            session.exec(delete(Asset).where(col(Asset.id).in_(ids)))
            session.commit()
        removed["assets"] = len(ids)
    return removed


def main() -> None:
    parser = argparse.ArgumentParser(description="Carga de volumen para medir el caching")
    parser.add_argument("--incidents", type=int, default=5000)
    parser.add_argument("--assets", type=int, default=300)
    parser.add_argument("--orders-per-asset", type=int, default=25)
    parser.add_argument("--seed", type=int, default=42, help="semilla aleatoria (datos reproducibles)")
    parser.add_argument("--purge", action="store_true", help="borra solo lo creado por este script")
    args = parser.parse_args()

    create_db_and_tables()
    if args.purge:
        removed = purge()
        print(f"Borrado: {removed['incidents']} incidencias y {removed['assets']} activos (con sus órdenes).")
    else:
        rng = random.Random(args.seed)
        user_uuid = _admin_uuid()
        n = seed_incidents(args.incidents, rng)
        created = seed_inventory(args.assets, args.orders_per_asset, user_uuid, rng)
        print(
            f"Carga creada: {n} incidencias, {created['assets']} activos, "
            f"{created['entries']} entradas y {created['exits']} salidas."
        )
    # Este script escribe sin pasar por la API: si la API está arrancada, su caché no se
    # entera y sirve lo anterior hasta que caduque el TTL (30-60 s) o la reinicies
    print("Si la API ya estaba arrancada, espera 60 s o reiníciala para ver los datos nuevos.")


if __name__ == "__main__":
    main()
