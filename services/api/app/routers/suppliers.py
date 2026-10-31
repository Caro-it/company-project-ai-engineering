"""Endpoints del Directorio de Proveedores de Nexova."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from tinydb import Query

from app.database import suppliers_table
from app.deps import get_current_user
from app.models import (
    Category,
    Country,
    RateUpdate,
    StatusUpdate,
    Supplier,
    SupplierCreate,
)

router = APIRouter(
    prefix="/suppliers",
    tags=["suppliers"],
    dependencies=[Depends(get_current_user)],
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_supplier(doc) -> Supplier:
    """Convierte un documento de TinyDB en el modelo de respuesta (con id)."""
    return Supplier(id=doc.doc_id, **doc)


def _get_or_404(supplier_id: int):
    doc = suppliers_table.get(doc_id=supplier_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return doc


@router.post("", response_model=Supplier, status_code=201)
def create_supplier(payload: SupplierCreate):
    doc = payload.model_dump(mode="json")
    doc["updated_at"] = _now()
    new_id = suppliers_table.insert(doc)
    return _to_supplier(suppliers_table.get(doc_id=new_id))


@router.get("", response_model=list[Supplier])
def list_suppliers(country: Country | None = None, category: Category | None = None):
    S = Query()
    conditions = []
    if country:
        conditions.append(S.country == country.value)
    if category:
        conditions.append(S.categories.any([category.value]))

    if not conditions:
        docs = suppliers_table.all()
    else:
        condition = conditions[0]
        for extra in conditions[1:]:
            condition = condition & extra
        docs = suppliers_table.search(condition)

    return [_to_supplier(doc) for doc in docs]


@router.get("/{supplier_id}", response_model=Supplier)
def get_supplier(supplier_id: int):
    return _to_supplier(_get_or_404(supplier_id))


@router.patch("/{supplier_id}/rate", response_model=Supplier)
def update_rate(supplier_id: int, payload: RateUpdate):
    _get_or_404(supplier_id)
    # Trazabilidad: cada cambio de tarifa registra updated_at
    suppliers_table.update(
        {"monthly_rate": payload.monthly_rate, "updated_at": _now()},
        doc_ids=[supplier_id],
    )
    return _to_supplier(suppliers_table.get(doc_id=supplier_id))


@router.patch("/{supplier_id}/status", response_model=Supplier)
def update_status(supplier_id: int, payload: StatusUpdate):
    _get_or_404(supplier_id)
    # updated_at NO cambia: en el CONTEXT es el timestamp de la última actualización de TARIFA
    suppliers_table.update({"status": payload.status.value}, doc_ids=[supplier_id])
    return _to_supplier(suppliers_table.get(doc_id=supplier_id))


@router.delete("/{supplier_id}", response_model=Supplier)
def delete_supplier(supplier_id: int):
    doc = _get_or_404(supplier_id)
    deleted = _to_supplier(doc)
    suppliers_table.remove(doc_ids=[supplier_id])
    return deleted