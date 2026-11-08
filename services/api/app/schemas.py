"""Schemas Pydantic de request/response del inventario de Nexova.

Fuente de verdad: docs/CONTEXT-inventory-nexova.md

Son clases distintas de los modelos ORM de app/models.py, aunque compartan campos:
- Los *Create* son lo único que acepta la API. Prohíben campos extra (extra="forbid"):
  no se puede enviar `current_stock`, `user_uuid`, `id` ni `created_at`.
- Los *Read* son lo único que devuelve la API. `current_stock` solo existe aquí,
  calculado a partir de las órdenes.
"""
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.inventory_catalog import AssetCategory, ExitType, Office

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Sku = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class _CreateSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Asset ----------------------------------------------------------------------------


class AssetCreate(_CreateSchema):
    """Body de POST /inventory/products. Un activo nuevo empieza con stock 0."""

    name: NonEmptyText = Field(examples=['Portátil 14" Business'])
    sku: Sku = Field(examples=["NXV-IT-003"])
    category: AssetCategory
    office: Office


class AssetRead(BaseModel):
    """Activo con su stock actual (calculado, no almacenado)."""

    id: int
    name: str
    sku: str
    category: AssetCategory
    office: Office
    current_stock: int


class AssetSummary(BaseModel):
    """Datos del activo que acompañan a cada orden en GET /inventory/orders."""

    id: int
    name: str
    sku: str
    category: AssetCategory
    office: Office


# --- AssetEntry (orden de entrada) -------------------------------------------------


class AssetEntryCreate(_CreateSchema):
    """Body de POST /inventory/orders/inbound. user_uuid sale del token, no del body."""

    asset_id: int
    quantity: int = Field(gt=0, description="Unidades recibidas")
    supplier: NonEmptyText = Field(examples=["TechDistrib Valencia S.L."])
    office: Office = Field(description="Oficina receptora: debe ser la oficina del activo")


class AssetEntryRead(BaseModel):
    id: int
    asset_id: int
    quantity: int
    supplier: str
    office: Office
    created_at: datetime
    user_uuid: str


# --- AssetExit (orden de salida) ---------------------------------------------------


class AssetExitCreate(_CreateSchema):
    """Body de POST /inventory/orders/outbound. user_uuid sale del token, no del body."""

    asset_id: int
    quantity: int = Field(gt=0, description="Unidades asignadas o consumidas")
    exit_type: ExitType
    assigned_to: NonEmptyText | None = Field(
        default=None,
        description='Obligatorio si exit_type = "allocation"; nulo si es "consumption"',
    )
    office: Office = Field(description="Oficina de la salida: debe ser la oficina del activo")

    @model_validator(mode="after")
    def check_assigned_to(self) -> Self:
        # Regla 3 del BRIEFING
        if self.exit_type == ExitType.ALLOCATION and self.assigned_to is None:
            raise ValueError('assigned_to es obligatorio cuando exit_type es "allocation"')
        if self.exit_type == ExitType.CONSUMPTION and self.assigned_to is not None:
            raise ValueError('assigned_to debe ser nulo cuando exit_type es "consumption"')
        return self


class AssetExitRead(BaseModel):
    id: int
    asset_id: int
    quantity: int
    exit_type: ExitType
    assigned_to: str | None
    office: Office
    created_at: datetime
    user_uuid: str


# --- Historial combinado ------------------------------------------------------------


class OrderRead(BaseModel):
    """Una fila de GET /inventory/orders: entrada o salida, con los datos del activo."""

    order_type: Literal["inbound", "outbound"]
    id: int
    asset: AssetSummary
    quantity: int
    office: Office
    created_at: datetime
    user_uuid: str
    # Solo en entradas
    supplier: str | None = None
    # Solo en salidas
    exit_type: ExitType | None = None
    assigned_to: str | None = None
