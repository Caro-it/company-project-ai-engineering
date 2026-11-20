"""Añade a las tablas de inventario de Supabase los campos que necesita la telemetría.

También deja lista la tabla telemetry_events (default del id y trigger de solo
inserción), por si se creó antes que el trigger.

Uso (desde services/api, con DATABASE_URL de Supabase en .env):
  uv run migrate-telemetry --dry-run   # solo muestra el SQL
  uv run migrate-telemetry             # lo aplica, en una sola transacción

Por qué hace falta: create_all (al arrancar la API) crea las tablas que faltan, pero no
añade columnas a las que ya existen. Fuente: docs/telemetry/telemetry-plan.md §1.3.

- Idempotente: se puede ejecutar varias veces (ADD COLUMN IF NOT EXISTS, constraints
  solo si no existen, rellenos solo donde el valor es NULL).
- No borra ni modifica datos existentes salvo para rellenar las columnas nuevas.
- Relleno provisional de los activos que ya existen (PENDIENTE de confirmar con el mentor):
    category = training_materials → product_category training_kit,     programme_id formacion-general
    cualquier otra categoría     → product_category onboarding_equipment, programme_id onboarding-general
  Corrígelo después activo por activo si hace falta (UPDATE asset SET … WHERE sku = …).
- Las entradas y salidas antiguas quedan con unit_cost/currency/recipient_type a NULL:
  la telemetría solo existe para las órdenes nuevas.
"""
import argparse
import sys

from sqlalchemy import text

from app.database import create_db_and_tables, engine
from app.inventory_catalog import (
    DEFAULT_MIN_STOCK,
    Currency,
    ProductCategory,
    RecipientType,
    sql_in,
)
from app.telemetry_store import POSTGRES_DDL


def _add_check(table: str, name: str, condition: str) -> str:
    # ADD CONSTRAINT no tiene IF NOT EXISTS en PostgreSQL: se comprueba en pg_constraint
    return f"""DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{name}') THEN
    ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({condition});
  END IF;
END $$"""


STATEMENTS: list[str] = [
    # --- asset --------------------------------------------------------------------------
    "ALTER TABLE asset ADD COLUMN IF NOT EXISTS programme_id VARCHAR(60)",
    "ALTER TABLE asset ADD COLUMN IF NOT EXISTS product_category VARCHAR(30)",
    f"ALTER TABLE asset ADD COLUMN IF NOT EXISTS min_stock INTEGER NOT NULL DEFAULT {DEFAULT_MIN_STOCK}",
    """UPDATE asset SET product_category = CASE category
         WHEN 'training_materials' THEN 'training_kit'
         ELSE 'onboarding_equipment' END
       WHERE product_category IS NULL""",
    """UPDATE asset SET programme_id = CASE category
         WHEN 'training_materials' THEN 'formacion-general'
         ELSE 'onboarding-general' END
       WHERE programme_id IS NULL""",
    "ALTER TABLE asset ALTER COLUMN programme_id SET NOT NULL",
    "ALTER TABLE asset ALTER COLUMN product_category SET NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_asset_programme_id ON asset (programme_id)",
    _add_check("asset", "ck_asset_product_category", f"product_category IN ({sql_in(ProductCategory)})"),
    _add_check("asset", "ck_asset_min_stock", "min_stock >= 0"),
    # --- asset_entry ---------------------------------------------------------------------
    "ALTER TABLE asset_entry ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 2)",
    "ALTER TABLE asset_entry ADD COLUMN IF NOT EXISTS currency VARCHAR(3)",
    _add_check("asset_entry", "ck_asset_entry_unit_cost", "unit_cost IS NULL OR unit_cost > 0"),
    _add_check(
        "asset_entry", "ck_asset_entry_currency", f"currency IS NULL OR currency IN ({sql_in(Currency)})"
    ),
    # --- asset_exit ----------------------------------------------------------------------
    "ALTER TABLE asset_exit ADD COLUMN IF NOT EXISTS recipient_type VARCHAR(20)",
    _add_check(
        "asset_exit",
        "ck_asset_exit_recipient_type",
        f"recipient_type IS NULL OR recipient_type IN ({sql_in(RecipientType)})",
    ),
    # --- telemetry_events (proyecto de almacenamiento) ------------------------------------
    # create_all (al arrancar la API o justo antes de esta migración) crea la tabla y sus
    # índices; esto asegura el default del id y el trigger de solo inserción
    *POSTGRES_DDL,
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Campos de telemetría en el inventario")
    parser.add_argument("--dry-run", action="store_true", help="muestra el SQL sin ejecutarlo")
    args = parser.parse_args()

    if args.dry_run:
        print(";\n\n".join(STATEMENTS) + ";")
        return
    if engine.dialect.name != "postgresql":
        sys.exit(
            f"Esta migración es para PostgreSQL (Supabase) y DATABASE_URL apunta a "
            f"{engine.dialect.name}. En SQLite basta con borrar la BD: create_all la recrea."
        )

    create_db_and_tables()  # crea telemetry_events (y lo que falte) antes de los ALTER
    with engine.begin() as connection:  # una transacción: o todo o nada
        for statement in STATEMENTS:
            connection.execute(text(statement))
        filled = connection.execute(
            text("SELECT programme_id, product_category, count(*) FROM asset GROUP BY 1, 2 ORDER BY 1, 2")
        ).all()
    print("Migración de telemetría aplicada. Activos por programa y categoría:")
    for programme_id, product_category, count in filled:
        print(f"  {programme_id:<24} {product_category:<22} {count}")


if __name__ == "__main__":
    main()
