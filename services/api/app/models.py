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

from sqlalchemy import CheckConstraint, Column, DateTime
from sqlmodel import Field, Relationship, SQLModel

from app.inventory_catalog import AssetCategory, ExitType, Office, sql_in


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
    )

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    sku: str = Field(max_length=50, unique=True, index=True)
    category: str = Field(max_length=30)
    office: str = Field(max_length=20, index=True)

    entries: list["AssetEntry"] = Relationship(back_populates="asset")
    exits: list["AssetExit"] = Relationship(back_populates="asset")


class AssetEntry(SQLModel, table=True):
    """Compra o entrega de proveedor recibida por Nexova (equivale a InboundOrder)."""

    __tablename__ = "asset_entry"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_asset_entry_quantity_positive"),
        CheckConstraint(f"office IN ({sql_in(Office)})", name="ck_asset_entry_office"),
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True, ondelete="RESTRICT")
    quantity: int
    supplier: str = Field(max_length=200)
    office: str = Field(max_length=20)
    created_at: datetime = _created_at_field()
    # UUID del usuario de TinyDB que registró la entrada (sin FK: no hay usuarios en Supabase)
    user_uuid: str = Field(max_length=36, index=True)

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
    )

    id: int | None = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="asset.id", index=True, ondelete="RESTRICT")
    quantity: int
    exit_type: str = Field(max_length=20)
    assigned_to: str | None = Field(default=None, max_length=200)
    office: str = Field(max_length=20)
    created_at: datetime = _created_at_field()
    user_uuid: str = Field(max_length=36, index=True)

    asset: Asset = Relationship(back_populates="exits")
