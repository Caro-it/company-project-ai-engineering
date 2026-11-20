"""Almacenamiento de telemetría en Supabase (proyecto "Telemetría – Almacenamiento").

Tabla `telemetry_events`: solo inserción. Los eventos son hechos inmutables, así que no
hay código que haga UPDATE ni DELETE, y en PostgreSQL un trigger (uv run migrate-telemetry)
rechaza cualquier UPDATE o DELETE que llegue por otra vía.

Mapeo envelope → fila (documentado en docs/telemetry/telemetry-plan.md §5.3):
  timestamp  ← event.timestamp           service ← event.source
  event_type ← event.event_type          level   ← LEVELS (warn/error/info)
  value      ← VALUE_KEYS (una propiedad numérica por evento, si aplica)
  message    ← resumen legible (event_type + dimensiones del BRIEFING)
  tags       ← event.properties (ya validadas contra el allowlist de event-schemas.json)
               + "_envelope": eventId, sessionId, userId, schemaVersion, requestId
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from jsonschema import Draft7Validator, FormatChecker
from sqlalchemy import (
    DDL,
    JSON,
    Column,
    DateTime,
    Index,
    Numeric,
    Text,
    Uuid,
    insert,
    select,
)
from sqlalchemy import event as sa_event
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Session, SQLModel

from app.telemetry_models import TelemetryEvent

# JSONB en PostgreSQL (índice GIN), JSON en SQLite (tests)
TagsType = JSON().with_variant(JSONB(), "postgresql")

SCHEMAS_PATH = Path(__file__).resolve().parents[3] / "docs" / "telemetry" / "event-schemas.json"

# level: errores técnicos → error; rechazos, fallos y alertas de negocio → warn; resto → info
LEVELS: dict[str, str] = {
    "frontend_error_captured": "error",
    "api_error_occurred": "error",
    "stock_threshold_triggered": "warn",
    "stock_depleted": "warn",
    "kit_cost_variance_detected": "warn",
    "direct_stock_edit_rejected": "warn",
    "inbound_order_rejected": "warn",
    "outbound_order_rejected": "warn",
    "product_create_rejected": "warn",
    "order_form_validation_failed": "warn",
    "login_failed": "warn",
    "session_expired": "warn",
    "password_reset_failed": "warn",
    "permission_denied": "warn",
    "api_request_failed": "warn",
}

# value: la magnitud principal de cada evento, para sumar o promediar sin abrir tags
VALUE_KEYS: dict[str, str] = {
    "inbound_order_created": "quantity",
    "outbound_order_created": "quantity",
    "stock_threshold_triggered": "stock_after",
    "direct_stock_edit_rejected": "quantity",
    "kit_cost_variance_detected": "variance_pct",
    "outbound_order_rejected": "quantity",
    "order_form_abandoned": "time_on_form_ms",
    "api_latency_recorded": "p95_ms",
    "page_load_recorded": "lcp_ms",
    "api_request_failed": "elapsed_ms",
    "supplier_rate_changed": "change_pct",
    "incident_status_changed": "minutes_in_previous_status",
}

# Dimensiones que van al message, en este orden, si el evento las tiene
MESSAGE_KEYS = ("office", "programme_id", "product_id", "page", "route", "reason", "error_code", "status_code")


class TelemetryEventRecord(SQLModel, table=True):
    __tablename__ = "telemetry_events"
    __table_args__ = (
        Index("ix_telemetry_events_timestamp", "timestamp"),
        Index("ix_telemetry_events_event_type", "event_type"),
        Index("ix_telemetry_events_tags", "tags", postgresql_using="gin"),
    )

    # El default gen_random_uuid() de PostgreSQL lo pone _POSTGRES_DDL; la API genera
    # el uuid igualmente al insertar
    id: UUID = Field(default_factory=uuid4, sa_column=Column(Uuid(as_uuid=True), primary_key=True))
    timestamp: Any = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    service: str = Field(sa_column=Column(Text, nullable=False))
    event_type: str = Field(sa_column=Column(Text, nullable=False))
    level: str = Field(default="info", sa_column=Column(Text, nullable=False, server_default="info"))
    value: float | None = Field(default=None, sa_column=Column(Numeric, nullable=True))
    message: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    tags: dict = Field(default_factory=dict, sa_column=Column(TagsType, nullable=False, server_default="{}"))


# Solo en PostgreSQL, justo después de que create_all cree la tabla (al arrancar la API):
# default del id y trigger que impide UPDATE y DELETE (eventos inmutables). Para una tabla
# que ya existiera, lo mismo hace `uv run migrate-telemetry`.
IMMUTABLE_FUNCTION_SQL = """
CREATE OR REPLACE FUNCTION telemetry_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'telemetry_events es solo de inserción' USING DETAIL = TG_OP || ' no permitido';
END;
$$ LANGUAGE plpgsql"""
IMMUTABLE_TRIGGER_SQL = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'telemetry_events_no_update_delete') THEN
    CREATE TRIGGER telemetry_events_no_update_delete
      BEFORE UPDATE OR DELETE ON telemetry_events
      FOR EACH ROW EXECUTE FUNCTION telemetry_events_immutable();
  END IF;
END $$"""
ID_DEFAULT_SQL = "ALTER TABLE telemetry_events ALTER COLUMN id SET DEFAULT gen_random_uuid()"
POSTGRES_DDL = [ID_DEFAULT_SQL, IMMUTABLE_FUNCTION_SQL, IMMUTABLE_TRIGGER_SQL]

for _sql in POSTGRES_DDL:
    sa_event.listen(
        TelemetryEventRecord.__table__, "after_create", DDL(_sql).execute_if(dialect="postgresql")
    )


# --- Validación contra el contrato (event-schemas.json) ------------------------------------


@lru_cache(maxsize=1)
def _schemas() -> dict:
    return json.loads(SCHEMAS_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=64)
def _validator(event_type: str) -> Draft7Validator | None:
    schema = _schemas()
    if event_type not in schema["definitions"] or event_type == "envelope":
        return None
    return Draft7Validator(
        {"$ref": f"#/definitions/{event_type}", "definitions": schema["definitions"]},
        format_checker=FormatChecker(),
    )


def validate_event(raw: Any) -> TelemetryEvent | None:
    """El envelope con el modelo TelemetryEvent (sin cambios desde la captura) y las
    properties con el allowlist de su event_type. None si no cumple."""
    try:
        event = TelemetryEvent.model_validate(raw)
    except ValueError:  # pydantic.ValidationError hereda de ValueError
        return None
    validator = _validator(event.event_type)
    if validator is None or any(True for _ in validator.iter_errors(raw)):
        return None
    return event


# --- Fila de la tabla ------------------------------------------------------------------------


def _message(event: TelemetryEvent) -> str:
    dims = [f"{key}={event.properties[key]}" for key in MESSAGE_KEYS if key in event.properties]
    return " · ".join([event.event_type, *dims])[:500]


def _value(event: TelemetryEvent) -> float | None:
    key = VALUE_KEYS.get(event.event_type)
    value = event.properties.get(key) if key else None
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def to_row(event: TelemetryEvent) -> dict:
    return {
        "id": uuid4(),
        "timestamp": event.timestamp,
        "service": event.source,
        "event_type": event.event_type,
        "level": LEVELS.get(event.event_type, "info"),
        "value": _value(event),
        "message": _message(event),
        "tags": {
            **event.properties,
            "_envelope": {
                "event_id": str(event.eventId),
                "session_id": str(event.sessionId) if event.sessionId else None,
                "user_id": str(event.userId) if event.userId else None,
                "schema_version": event.schemaVersion,
                "request_id": str(event.requestId) if event.requestId else None,
                "environment": event.environment,
            },
        },
    }


def _existing_event_ids(session: Session, event_ids: list[str]) -> set[str]:
    """eventIds de este lote que ya están guardados (reintentos del frontend)."""
    if not event_ids:
        return set()
    # tags->'_envelope'->>'event_id' en PostgreSQL; json_extract en SQLite (tests)
    expr = TelemetryEventRecord.__table__.c.tags[("_envelope", "event_id")].as_string()
    return {str(value) for value in session.execute(select(expr).where(expr.in_(event_ids))).scalars()}


def store_events(session: Session, events: list[TelemetryEvent]) -> int:
    """Inserta los eventos en UNA sola operación (bulk insert, una transacción).

    Idempotente por eventId: un evento repetido (dentro del lote o ya guardado por un
    envío anterior que el frontend reintentó) no se vuelve a insertar, pero cuenta como
    guardado. Devuelve cuántos eventos quedan guardados.
    """
    unique: dict[str, TelemetryEvent] = {}
    for event in events:
        unique.setdefault(str(event.eventId), event)
    already = _existing_event_ids(session, list(unique))
    rows = [to_row(event) for event_id, event in unique.items() if event_id not in already]
    if rows:
        session.execute(insert(TelemetryEventRecord.__table__), rows)
        session.commit()
    return len(events)
