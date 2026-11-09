"""Router de inventario (ticket NXV-0201). Todas las rutas bajo /inventory.

- Datos de negocio en Supabase: sesión SQLModel por petición con Depends(get_db).
- Autenticación en TinyDB: Depends(get_current_user); su `id` se guarda como user_uuid.
- Todas las rutas exigen token (también los GET): el BRIEFING de Nexova no declara
  ninguna lectura pública y el backoffice siempre llama con Bearer.
- Se responde siempre con schemas de app/schemas.py, nunca con modelos ORM.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.database import get_db
from app.deps import get_current_user
from app.inventory_catalog import AssetCategory, Office
from app.schemas import (
    AssetCreate,
    AssetEntryCreate,
    AssetEntryRead,
    AssetExitCreate,
    AssetExitRead,
    AssetRead,
    OrderRead,
)
from app.services import inventory
from app.services.inventory import InventoryError

router = APIRouter(
    prefix="/inventory",
    tags=["inventory"],
    dependencies=[Depends(get_current_user)],
)


def _http(error: InventoryError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


@router.get("/products", response_model=list[AssetRead])
def list_products(
    office: Office | None = None,
    category: AssetCategory | None = None,
    session: Session = Depends(get_db),
) -> list[AssetRead]:
    """Todos los activos con su current_stock calculado. Filtros opcionales: office, category."""
    return inventory.list_assets(session, office=office, category=category)


@router.post("/products", response_model=AssetRead, status_code=201)
def create_product(data: AssetCreate, session: Session = Depends(get_db)) -> AssetRead:
    """Registra un activo nuevo. Empieza con stock 0: solo sube con entradas."""
    try:
        return inventory.create_asset(session, data)
    except InventoryError as error:
        raise _http(error) from None


@router.get("/products/{asset_id}", response_model=AssetRead)
def get_product(asset_id: int, session: Session = Depends(get_db)) -> AssetRead:
    asset = inventory.get_asset(session, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Activo {asset_id} no encontrado")
    return asset


@router.post("/orders/inbound", response_model=AssetEntryRead, status_code=201)
def create_inbound_order(
    data: AssetEntryCreate,
    session: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> AssetEntryRead:
    """Registra una entrega de activos (AssetEntry)."""
    try:
        entry = inventory.create_entry(session, data, user_uuid=current_user["id"])
    except InventoryError as error:
        raise _http(error) from None
    return AssetEntryRead.model_validate(entry, from_attributes=True)


@router.post("/orders/outbound", response_model=AssetExitRead, status_code=201)
def create_outbound_order(
    data: AssetExitCreate,
    session: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> AssetExitRead:
    """Registra una asignación o consumo (AssetExit). 400 si no hay stock suficiente."""
    try:
        exit_ = inventory.create_exit(session, data, user_uuid=current_user["id"])
    except InventoryError as error:
        raise _http(error) from None
    return AssetExitRead.model_validate(exit_, from_attributes=True)


@router.get("/orders", response_model=list[OrderRead])
def list_orders(office: Office | None = None, session: Session = Depends(get_db)) -> list[OrderRead]:
    """Entradas y salidas con los datos del activo y el user_uuid, más recientes primero."""
    return inventory.list_orders(session, office=office)
