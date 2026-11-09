"""Consultas y reglas de negocio del inventario (Supabase vía SQLModel).

El stock nunca se lee de una columna: se calcula en la propia consulta con
SUMA(entradas) − SUMA(salidas) por activo. Cada activo pertenece a una sola oficina,
así que su stock ya es el stock de esa oficina (el de Valencia y el de Miami nunca
se mezclan).

Sin N+1: los listados cargan los datos relacionados en la misma consulta (subconsultas
agregadas para el stock y JOIN con Asset para el historial), no al acceder a cada fila.
"""
from collections.abc import Sequence

from sqlalchemy import func
from sqlmodel import Session, select

from app.inventory_catalog import AssetCategory, Office
from app.models import Asset, AssetEntry, AssetExit
from app.schemas import (
    AssetCreate,
    AssetEntryCreate,
    AssetExitCreate,
    AssetRead,
    AssetSummary,
    OrderRead,
)


class InventoryError(Exception):
    """Error de negocio; el router lo traduce a HTTP."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


# --- Stock calculado -----------------------------------------------------------------


def _stock_query():
    """SELECT asset.*, COALESCE(SUM entradas, 0) − COALESCE(SUM salidas, 0) AS current_stock."""
    entries = (
        select(AssetEntry.asset_id, func.sum(AssetEntry.quantity).label("total"))
        .group_by(AssetEntry.asset_id)
        .subquery()
    )
    exits = (
        select(AssetExit.asset_id, func.sum(AssetExit.quantity).label("total"))
        .group_by(AssetExit.asset_id)
        .subquery()
    )
    current_stock = (func.coalesce(entries.c.total, 0) - func.coalesce(exits.c.total, 0)).label(
        "current_stock"
    )
    return (
        select(Asset, current_stock)
        .outerjoin(entries, entries.c.asset_id == Asset.id)
        .outerjoin(exits, exits.c.asset_id == Asset.id)
    )


def _to_read(asset: Asset, current_stock: int) -> AssetRead:
    return AssetRead(
        id=asset.id,
        name=asset.name,
        sku=asset.sku,
        category=asset.category,
        office=asset.office,
        current_stock=int(current_stock),
    )


def list_assets(
    session: Session, office: Office | None = None, category: AssetCategory | None = None
) -> list[AssetRead]:
    query = _stock_query().order_by(Asset.id)
    if office is not None:
        query = query.where(Asset.office == office)
    if category is not None:
        query = query.where(Asset.category == category)
    return [_to_read(asset, stock) for asset, stock in session.exec(query).all()]


def get_asset(session: Session, asset_id: int) -> AssetRead | None:
    row = session.exec(_stock_query().where(Asset.id == asset_id)).first()
    return None if row is None else _to_read(*row)


def _stock_of(session: Session, asset_id: int) -> int:
    entries = session.exec(
        select(func.coalesce(func.sum(AssetEntry.quantity), 0)).where(
            AssetEntry.asset_id == asset_id
        )
    ).one()
    exits = session.exec(
        select(func.coalesce(func.sum(AssetExit.quantity), 0)).where(
            AssetExit.asset_id == asset_id
        )
    ).one()
    return int(entries) - int(exits)


# --- Altas -----------------------------------------------------------------------------


def create_asset(session: Session, data: AssetCreate) -> AssetRead:
    if session.exec(select(Asset.id).where(Asset.sku == data.sku)).first() is not None:
        raise InventoryError(409, f"Ya existe un activo con el SKU '{data.sku}'")
    asset = Asset(**data.model_dump())
    session.add(asset)
    session.commit()
    session.refresh(asset)
    # Un activo nuevo no tiene órdenes: empieza con stock 0
    return _to_read(asset, 0)


def _load_asset_for_order(session: Session, asset_id: int, office: Office, *, lock: bool) -> Asset:
    query = select(Asset).where(Asset.id == asset_id)
    if lock:
        # SELECT … FOR UPDATE en PostgreSQL: dos salidas simultáneas del mismo activo
        # se procesan una detrás de otra, así no pueden dejar el stock en negativo.
        # (SQLite, en los tests, lo ignora.)
        query = query.with_for_update()
    asset = session.exec(query).first()
    if asset is None:
        raise InventoryError(404, f"Activo {asset_id} no encontrado")
    if asset.office != office:
        raise InventoryError(
            400,
            f"El activo '{asset.name}' ({asset.sku}) pertenece a la oficina "
            f"{asset.office}, no a {office}. El stock de cada oficina es independiente.",
        )
    return asset


def create_entry(session: Session, data: AssetEntryCreate, user_uuid: str) -> AssetEntry:
    _load_asset_for_order(session, data.asset_id, data.office, lock=False)
    entry = AssetEntry(**data.model_dump(), user_uuid=user_uuid)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def create_exit(session: Session, data: AssetExitCreate, user_uuid: str) -> AssetExit:
    asset = _load_asset_for_order(session, data.asset_id, data.office, lock=True)
    available = _stock_of(session, asset.id)
    if data.quantity > available:
        # Regla 2 del BRIEFING: se rechaza ANTES de escribir nada (mensaje literal)
        session.rollback()  # libera el FOR UPDATE
        raise InventoryError(
            400,
            f"Insufficient stock for asset '{asset.name}'. "
            f"Available: {available}, requested: {data.quantity}.",
        )
    exit_ = AssetExit(**data.model_dump(), user_uuid=user_uuid)
    session.add(exit_)
    session.commit()
    session.refresh(exit_)
    return exit_


# --- Historial -----------------------------------------------------------------------


def _summary(asset: Asset) -> AssetSummary:
    return AssetSummary(
        id=asset.id, name=asset.name, sku=asset.sku, category=asset.category, office=asset.office
    )


def list_orders(session: Session, office: Office | None = None) -> list[OrderRead]:
    """Entradas y salidas con los datos del activo, de la más reciente a la más antigua.

    Dos consultas en total (una por tabla, cada una con JOIN a asset), sin importar
    cuántas órdenes haya.
    """
    entries_query = select(AssetEntry, Asset).join(Asset, AssetEntry.asset_id == Asset.id)
    exits_query = select(AssetExit, Asset).join(Asset, AssetExit.asset_id == Asset.id)
    if office is not None:
        entries_query = entries_query.where(AssetEntry.office == office)
        exits_query = exits_query.where(AssetExit.office == office)

    entries: Sequence = session.exec(entries_query).all()
    exits: Sequence = session.exec(exits_query).all()

    orders = [
        OrderRead(
            order_type="inbound",
            id=entry.id,
            asset=_summary(asset),
            quantity=entry.quantity,
            office=entry.office,
            created_at=entry.created_at,
            user_uuid=entry.user_uuid,
            supplier=entry.supplier,
        )
        for entry, asset in entries
    ] + [
        OrderRead(
            order_type="outbound",
            id=exit_.id,
            asset=_summary(asset),
            quantity=exit_.quantity,
            office=exit_.office,
            created_at=exit_.created_at,
            user_uuid=exit_.user_uuid,
            exit_type=exit_.exit_type,
            assigned_to=exit_.assigned_to,
        )
        for exit_, asset in exits
    ]
    orders.sort(key=lambda order: (order.created_at, order.order_type, order.id), reverse=True)
    return orders
