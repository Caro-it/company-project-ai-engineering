"""Siembra en Supabase los datos de inventario del BRIEFING de Nexova (§ Datos Semilla).

Uso (desde services/api):  uv run seed-inventory   o   uv run python -m app.seed_inventory

- Crea las tablas si faltan (create_all) y es idempotente: los activos se buscan por SKU
  y las órdenes solo se siembran si el inventario aún no tiene ninguna, para que el
  stock sembrado sea exactamente el neto de entradas − salidas de esta lista.
- Las órdenes necesitan un user_uuid real de TinyDB: se usa el primer admin
  (créalo antes con `uv run create-admin`).

Stock esperado tras sembrar (GET /inventory/products):
  NXV-IT-001 12 · NXV-IT-002 8 · NXV-PER-001 0 · NXV-PER-002 4 · NXV-OFF-001 16 · NXV-TRN-001 0
"""
import sys
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, func, select

from app.auth_models import Role
from app.database import create_db_and_tables, engine, users_table
from app.inventory_catalog import OFFICE_CURRENCY, Office
from app.models import Asset, AssetEntry, AssetExit

ASSETS = [
    # name, sku, category, office, programme_id, product_category (telemetría)
    ('Portátil 14" Business', "NXV-IT-001", "hardware", "Valencia", "onboarding-soporte", "onboarding_equipment"),
    ('Portátil 14" Business', "NXV-IT-002", "hardware", "Miami", "onboarding-soporte", "onboarding_equipment"),
    ("Ratón ergonómico", "NXV-PER-001", "peripherals", "Valencia", "onboarding-soporte", "onboarding_equipment"),
    ("Hub USB-C", "NXV-PER-002", "peripherals", "Miami", "onboarding-soporte", "onboarding_equipment"),
    ("Resma de papel A4", "NXV-OFF-001", "office_supplies", "Valencia", "onboarding-general", "onboarding_equipment"),
    ("Cuaderno de formación en liderazgo", "NXV-TRN-001", "training_materials", "Valencia", "liderazgo-basico", "training_kit"),
]

ENTRIES = [
    # sku, quantity, supplier, días atrás, coste unitario (moneda de la oficina)
    ("NXV-IT-001", 10, "TechDistrib Valencia S.L.", 30, 850.00),
    ("NXV-IT-001", 5, "TechDistrib Valencia S.L.", 12, 870.00),
    ("NXV-IT-002", 8, "Office Depot Miami", 25, 940.00),
    ("NXV-PER-002", 6, "Office Depot Miami", 20, 39.90),
    ("NXV-OFF-001", 20, "Papelería Levante S.L.", 18, 4.50),
]

EXITS = [
    # sku, quantity, exit_type, assigned_to, días atrás, recipient_type
    ("NXV-IT-001", 3, "allocation", "Lucía Ferrer (Soporte externalizado)", 10, "support_agent"),
    ("NXV-PER-002", 2, "allocation", "Daniel Ortiz (Headhunting Miami)", 8, "consultant"),
    ("NXV-OFF-001", 4, "consumption", None, 5, "employee"),
]


def _seed_user_uuid() -> str:
    for user in users_table.all():
        if user.get("role") == Role.ADMIN and user.get("is_active"):
            return user["id"]
    sys.exit("No hay ningún admin activo en TinyDB. Créalo antes con: uv run create-admin")


def run(session: Session, user_uuid: str) -> dict:
    """Siembra en la sesión dada. Devuelve cuántos registros ha creado de cada tipo."""
    created = {"assets": 0, "entries": 0, "exits": 0}

    assets: dict[str, Asset] = {}
    for name, sku, category, office, programme_id, product_category in ASSETS:
        asset = session.exec(select(Asset).where(Asset.sku == sku)).first()
        if asset is None:
            asset = Asset(
                name=name,
                sku=sku,
                category=category,
                office=office,
                programme_id=programme_id,
                product_category=product_category,
            )
            session.add(asset)
            created["assets"] += 1
        assets[sku] = asset
    session.commit()
    for asset in assets.values():
        session.refresh(asset)

    has_orders = (
        session.exec(select(func.count()).select_from(AssetEntry)).one()
        + session.exec(select(func.count()).select_from(AssetExit)).one()
    ) > 0
    if has_orders:
        return created

    now = datetime.now(UTC)
    for sku, quantity, supplier, days_ago, unit_cost in ENTRIES:
        asset = assets[sku]
        session.add(
            AssetEntry(
                asset_id=asset.id,
                quantity=quantity,
                supplier=supplier,
                office=asset.office,
                created_at=now - timedelta(days=days_ago),
                user_uuid=user_uuid,
                unit_cost=unit_cost,
                currency=OFFICE_CURRENCY[Office(asset.office)],
            )
        )
        created["entries"] += 1
    for sku, quantity, exit_type, assigned_to, days_ago, recipient_type in EXITS:
        asset = assets[sku]
        session.add(
            AssetExit(
                asset_id=asset.id,
                quantity=quantity,
                exit_type=exit_type,
                assigned_to=assigned_to,
                office=asset.office,
                created_at=now - timedelta(days=days_ago),
                user_uuid=user_uuid,
                recipient_type=recipient_type,
            )
        )
        created["exits"] += 1
    session.commit()
    return created


def main() -> None:
    user_uuid = _seed_user_uuid()
    create_db_and_tables()
    with Session(engine) as session:
        created = run(session, user_uuid)
    print(
        f"Inventario sembrado: {created['assets']} activos, "
        f"{created['entries']} entradas y {created['exits']} salidas nuevas."
    )
    if created["entries"] == 0 and created["exits"] == 0:
        print("Ya había órdenes en el inventario: no se han sembrado órdenes nuevas.")


if __name__ == "__main__":
    main()
