"""Bandeja de salida de emails (`email_deliveries`): cada email que depende de un proveedor
externo (Resend) es una fila con su estado, y un worker de Celery lo envía fuera del ciclo
petición-respuesta.

    pending → processing → completed
                        ↘ failed      (tras agotar los reintentos; también en la DLQ)

- **Clave de idempotencia** (`idempotency_key`, única): encolar dos veces la misma operación
  con la misma clave devuelve la misma fila y no crea un segundo envío. El worker comprueba
  antes de enviar que la fila no está ya `completed`, y la misma clave viaja a Resend como
  cabecera `Idempotency-Key`. Así, si Resend aceptó un envío pero la confirmación no llegó
  y se reintenta, Resend no lo envía otra vez.
- **Toma de la fila** (`claim`): un UPDATE condicional pasa la fila a `processing`. Si dos
  workers reciben el mismo mensaje (reentrega), solo uno la toma. Una fila `processing` más
  antigua que `CLAIM_LEASE` se puede volver a tomar (worker muerto a mitad).
- **`attempts`**: nº de intentos de envío; `last_error`: el último error del proveedor.
- El enlace de recuperación lleva el token en claro: se guarda solo mientras hace falta y
  se borra (`payload = {}`) en cuanto la fila termina, bien o mal.

La tabla vive en la misma base de datos que la API (Supabase), no en TinyDB: la usan dos
procesos (API y worker) a la vez.
"""
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, DateTime, Integer, Text, Uuid, or_, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, Session, SQLModel

from app import database

PENDING = "pending"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

CLAIM_LEASE = timedelta(minutes=10)

PayloadType = JSON().with_variant(JSONB(), "postgresql")


def _now() -> datetime:
    return datetime.now(UTC)


class EmailDelivery(SQLModel, table=True):
    __tablename__ = "email_deliveries"

    id: UUID = Field(default_factory=uuid4, sa_column=Column(Uuid(as_uuid=True), primary_key=True))
    idempotency_key: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    kind: str = Field(sa_column=Column(Text, nullable=False))
    recipient: str = Field(sa_column=Column(Text, nullable=False))
    payload: dict = Field(default_factory=dict, sa_column=Column(PayloadType, nullable=False))
    status: str = Field(default=PENDING, sa_column=Column(Text, nullable=False, index=True))
    attempts: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    last_error: str | None = Field(default=None, sa_column=Column(Text))
    provider_message_id: str | None = Field(default=None, sa_column=Column(Text))
    task_id: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(default_factory=_now, sa_column=Column(DateTime(timezone=True), nullable=False))
    completed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))


def _session() -> Session:
    return Session(database.engine, expire_on_commit=False)


def ensure_table() -> None:
    EmailDelivery.__table__.create(database.engine, checkfirst=True)


def create(idempotency_key: str, kind: str, recipient: str, payload: dict[str, Any]) -> tuple[EmailDelivery, bool]:
    """Registra el envío en `pending`. Si la clave ya existe, devuelve la fila existente y
    False: la misma operación no se registra dos veces."""
    ensure_table()
    with _session() as session:
        delivery = EmailDelivery(idempotency_key=idempotency_key, kind=kind, recipient=recipient, payload=payload)
        session.add(delivery)
        try:
            session.commit()
            return delivery, True
        except IntegrityError:
            session.rollback()
    existing = get_by_key(idempotency_key)
    if existing is None:  # pragma: no cover — borrada entre medias
        raise LookupError(idempotency_key)
    return existing, False


def get(delivery_id: UUID | str) -> EmailDelivery | None:
    with _session() as session:
        return session.get(EmailDelivery, UUID(str(delivery_id)))


def get_by_key(idempotency_key: str) -> EmailDelivery | None:
    with _session() as session:
        query = select(EmailDelivery).where(EmailDelivery.idempotency_key == idempotency_key)
        return session.exec(query).scalars().first()


def latest(status: str | None = None, limit: int = 50) -> list[EmailDelivery]:
    with _session() as session:
        query = select(EmailDelivery).order_by(EmailDelivery.created_at.desc()).limit(limit)
        if status:
            query = query.where(EmailDelivery.status == status)
        return list(session.exec(query).scalars())


def _set(delivery_id: UUID, **values: Any) -> None:
    with _session() as session:
        session.execute(update(EmailDelivery).where(EmailDelivery.id == delivery_id).values(updated_at=_now(), **values))
        session.commit()


def set_task_id(delivery_id: UUID, task_id: str) -> None:
    _set(delivery_id, task_id=task_id)


def claim(delivery_id: UUID, now: datetime | None = None) -> bool:
    """`pending` → `processing` (o vuelve a tomar una `processing` caducada). True si este
    worker se queda la fila; False si ya está terminada o la tiene otro."""
    now = now or _now()
    with _session() as session:
        result = session.execute(
            update(EmailDelivery)
            .where(
                EmailDelivery.id == delivery_id,
                or_(
                    EmailDelivery.status == PENDING,
                    (EmailDelivery.status == PROCESSING) & (EmailDelivery.updated_at < now - CLAIM_LEASE),
                ),
            )
            .values(status=PROCESSING, attempts=EmailDelivery.attempts + 1, updated_at=now)
        )
        session.commit()
        return result.rowcount == 1


def mark_completed(delivery_id: UUID, provider_message_id: str | None, note: str | None = None) -> None:
    _set(
        delivery_id, status=COMPLETED, provider_message_id=provider_message_id, completed_at=_now(),
        last_error=note, payload={},
    )


def release_for_retry(delivery_id: UUID, error: str) -> None:
    """El intento falló y habrá otro: vuelve a `pending` con el error guardado."""
    _set(delivery_id, status=PENDING, last_error=error[:2000])


def mark_failed(delivery_id: UUID, error: str) -> None:
    """Reintentos agotados (o la cola no estaba disponible): fallo definitivo, visible."""
    _set(delivery_id, status=FAILED, last_error=error[:2000], payload={})
