"""Modelos ORM (SQLModel, table=True) del inventario de Nexova, persistidos en Supabase.

Fuente de verdad: docs/CONTEXT-inventory-nexova.md

- No hay columna de stock: `current_stock` se calcula siempre a partir de las órdenes
  (SUMA(AssetEntry.quantity) − SUMA(AssetExit.quantity)) y solo existe en los schemas
  de respuesta (app/schemas.py).
- No hay modelo User: `user_uuid` es el id del usuario en TinyDB (texto, sin FK).
- Estos modelos nunca se devuelven desde un endpoint: los routers responden con los
  schemas de app/schemas.py.
"""
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Numeric
from sqlmodel import Field, Relationship, SQLModel

from app.inventory_catalog import (
    DEFAULT_MIN_STOCK,
    AssetCategory,
    Currency,
    ExitType,
    Office,
    ProductCategory,
    RecipientType,
    sql_in,
)


def utc_now() -> datetime:
    return datetime.now(UTC)


def _created_at_field() -> datetime:
    return Field(
        default_factory=utc_now,
        sa_column=Column(DateTime(timezone=True), nullable=False),
    )


class Asset(SQLModel, table=True):
    """Activo inventariable de una oficina (equivale a Product del README)."""

    __tablename__ = "asset"
    __table_args__ = (
        CheckConstraint(f"category IN ({sql_in(AssetCategory)})", name="ck_asset_category"),
        CheckConstraint(f"office IN ({sql_in(Office)})", name="ck_asset_office"),
        CheckConstraint(
            f"product_category IN ({sql_in(ProductCategory)})", name="ck_asset_product_category"
        ),
        CheckConstraint("min_stock >= 0", name="ck_asset_min_stock"),
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    sku: str = Field(max_length=50, unique=True, index=True)
    category: str = Field(max_length=30)
    office: str = Field(max_length=20, index=True)
    # Telemetría (docs/telemetry/telemetry-plan.md §1.3): programa, categoría del BRIEFING
    # de telemetría y umbral de stock mínimo. En Supabase los añade `uv run migrate-telemetry`
    programme_id: str = Field(max_length=60, index=True)
    product_category: str = Field(max_length=30)
    min_stock: int = Field(default=DEFAULT_MIN_STOCK)

    entries: list["AssetEntry"] = Relationship(back_populates="asset")
    exits: list["AssetExit"] = Relationship(back_populates="asset")


class AssetEntry(SQLModel, table=True):
    """Compra o entrega de proveedor recibida por Nexova (equivale a InboundOrder)."""

    __tablename__ = "asset_entry"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_asset_entry_quantity_positive"),
        CheckConstraint(f"office IN ({sql_in(Office)})", name="ck_asset_entry_office"),
        CheckConstraint("unit_cost IS NULL OR unit_cost > 0", name="ck_asset_entry_unit_cost"),
        CheckConstraint(
            f"currency IS NULL OR currency IN ({sql_in(Currency)})", name="ck_asset_entry_currency"
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True, ondelete="RESTRICT")
    quantity: int
    supplier: str = Field(max_length=200)
    office: str = Field(max_length=20)
    created_at: datetime = _created_at_field()
    # UUID del usuario de TinyDB que registró la entrada (sin FK: no hay usuarios en Supabase)
    user_uuid: str = Field(max_length=36, index=True)
    # Coste unitario en la moneda de la oficina (nulo en las entradas anteriores a la
    # telemetría). currency la pone la API según la oficina, no el usuario
    unit_cost: float | None = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    currency: str | None = Field(default=None, max_length=3)

    asset: Asset = Relationship(back_populates="entries")


class AssetExit(SQLModel, table=True):
    """Asignación de un activo a un empleado o consumo (equivale a OutboundOrder)."""

    __tablename__ = "asset_exit"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_asset_exit_quantity_positive"),
        CheckConstraint(f"office IN ({sql_in(Office)})", name="ck_asset_exit_office"),
        CheckConstraint(f"exit_type IN ({sql_in(ExitType)})", name="ck_asset_exit_type"),
        # Regla 3 del BRIEFING, también en la BD: allocation ⇒ assigned_to; consumption ⇒ nulo
        CheckConstraint(
            "(exit_type = 'allocation' AND assigned_to IS NOT NULL) OR "
            "(exit_type = 'consumption' AND assigned_to IS NULL)",
            name="ck_asset_exit_assigned_to",
        ),
        CheckConstraint(
            f"recipient_type IS NULL OR recipient_type IN ({sql_in(RecipientType)})",
            name="ck_asset_exit_recipient_type",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True, ondelete="RESTRICT")
    quantity: int
    exit_type: str = Field(max_length=20)
    assigned_to: str | None = Field(default=None, max_length=200)
    office: str = Field(max_length=20)
    created_at: datetime = _created_at_field()
    user_uuid: str = Field(max_length=36, index=True)
    # A quién se entrega, como tipo (telemetría). Nulo en las salidas anteriores
    recipient_type: str | None = Field(default=None, max_length=20)

    asset: Asset = Relationship(back_populates="exits")
