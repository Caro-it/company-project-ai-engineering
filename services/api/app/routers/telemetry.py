"""Receptor de eventos de telemetría (proyecto "Telemetría – Almacenamiento").

Sustituye al stub sin cambiar la URL (settings.TELEMETRY_ENDPOINT /
NEXT_PUBLIC_TELEMETRY_ENDPOINT): el backoffice no cambia.

- Envelope laxo: solo se exige {"events": [...]}. Cada elemento se valida por separado
  (TelemetryEvent, sin cambios desde la captura, + allowlist de event-schemas.json): un
  evento inválido se cuenta en `rejected` y el resto del lote se guarda igual.
- Los válidos se guardan en telemetry_events en UNA operación (bulk insert).
- Responde 200 {"received", "stored", "rejected"} siempre que el envelope sea legible;
  422 solo si el cuerpo no es JSON o no trae un arreglo `events`.

Sin token, a propósito: el backoffice vacía la cola con navigator.sendBeacon al cerrar u
ocultar la pestaña, y sendBeacon no puede enviar Authorization. Por lo mismo el cuerpo puede
llegar como text/plain, así que se lee el cuerpo crudo en vez de declarar un body de FastAPI.
"""
import json
import logging
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from app.database import get_db
from app.telemetry_models import MAX_BATCH_SIZE, TelemetryReceived
from app.telemetry_store import store_events, validate_event

logger = logging.getLogger("api.telemetry")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

# Tamaño máximo del cuerpo: 200 eventos de ~1 KB caben de sobra
MAX_BODY_BYTES = 512 * 1024

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


def _envelope_error(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


@router.post("/events", response_model=TelemetryReceived)
async def receive_events(request: Request, session: Session = Depends(get_db)) -> TelemetryReceived:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Lote de telemetría demasiado grande")
    try:
        payload = json.loads(body or b"null")
    except (ValueError, UnicodeDecodeError):
        raise _envelope_error("El cuerpo no es JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("events"), list):
        raise _envelope_error('Se esperaba {"events": [...]}')
    raw_events = payload["events"]
    if len(raw_events) > MAX_BATCH_SIZE:
        raise _envelope_error(f"Máximo {MAX_BATCH_SIZE} eventos por lote")

    valid = [event for event in (validate_event(raw) for raw in raw_events) if event is not None]
    stored = store_events(session, valid)
    rejected = len(raw_events) - len(valid)

    counts = Counter(event.event_type for event in valid)
    logger.info(
        "telemetry batch: received=%d stored=%d rejected=%d → %s",
        len(raw_events),
        stored,
        rejected,
        ", ".join(f"{event_type}×{n}" for event_type, n in counts.most_common()) or "-",
    )
    return TelemetryReceived(received=len(raw_events), stored=stored, rejected=rejected)
