"""Estado de los emails encolados (`email_deliveries`): pendiente, en proceso, completado o
fallido, con el nº de intentos y el último error. Solo admin y manager: llevan el email del
destinatario. El enlace (con el token) nunca se devuelve.
"""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth_models import Role
from app.deps import get_current_user
from app.services import email_outbox as outbox


def require_admin_or_manager(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status_code=403, detail="Solo admin o manager pueden ver los envíos de email")
    return current_user


router = APIRouter(prefix="/email-deliveries", tags=["tasks"], dependencies=[Depends(require_admin_or_manager)])


class EmailDeliveryOut(BaseModel):
    id: UUID
    idempotency_key: str
    kind: str
    recipient: str
    status: str
    attempts: int
    last_error: str | None
    provider_message_id: str | None
    task_id: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


def _out(row) -> EmailDeliveryOut:
    return EmailDeliveryOut.model_validate(row, from_attributes=True)


@router.get("", response_model=list[EmailDeliveryOut])
def list_deliveries(status: str | None = None, limit: int = 50) -> list[EmailDeliveryOut]:
    if status is not None and status not in (outbox.PENDING, outbox.PROCESSING, outbox.COMPLETED, outbox.FAILED):
        raise HTTPException(status_code=422, detail="status debe ser pending, processing, completed o failed")
    return [_out(row) for row in outbox.latest(status, min(max(limit, 1), 200))]


@router.get("/{delivery_id}", response_model=EmailDeliveryOut)
def get_delivery(delivery_id: UUID) -> EmailDeliveryOut:
    row = outbox.get(delivery_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No existe ese envío")
    return _out(row)
