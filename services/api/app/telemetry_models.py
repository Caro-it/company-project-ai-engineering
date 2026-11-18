"""Modelo del envelope de telemetría (docs/telemetry/telemetry-plan.md §3.1).

Es el contrato con el backoffice (uis/backoffice/lib/telemetry.ts). TelemetryEvent no ha
cambiado desde el proyecto de captura: el receptor real (app/routers/telemetry.py) lo usa
como validador por evento. Aquí solo se valida el envelope: las `properties` de cada
event_type las valida docs/telemetry/event-schemas.json (app/telemetry_store.py).
"""
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

# Un lote nunca debería pasar de 20 (el backoffice envía cada 20 eventos o 10 s); el
# margen cubre el flush de sendBeacon con la cola acumulada tras varios reintentos
MAX_BATCH_SIZE = 200


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None or value.utcoffset().total_seconds() != 0:
        raise ValueError("timestamp debe ir en UTC con Z (ISO 8601)")
    return value


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: UUID
    timestamp: Annotated[datetime, AfterValidator(_utc)]
    sessionId: UUID | None
    userId: UUID | None
    event_type: str = Field(pattern=r"^[a-z]+(_[a-z]+)+$", max_length=60)
    schemaVersion: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    requestId: UUID | None
    source: Literal["backoffice", "website", "api", "job"]
    environment: Literal["development", "production"]
    properties: dict[str, Any]


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[TelemetryEvent] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class TelemetryReceived(BaseModel):
    """Respuesta del receptor: recibidos, guardados y rechazados (received = stored + rejected)."""

    received: int
    stored: int
    rejected: int
