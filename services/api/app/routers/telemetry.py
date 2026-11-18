"""Receptor de eventos de telemetría — STUB del proyecto de captura.

Solo valida el envelope y responde {"received": N}; no guarda nada. En la fase de
almacenamiento se sustituye por la inserción en Supabase sin cambiar la URL
(settings.TELEMETRY_ENDPOINT / NEXT_PUBLIC_TELEMETRY_ENDPOINT en el backoffice).

Sin token, a propósito: el backoffice vacía la cola con navigator.sendBeacon al cerrar u
ocultar la pestaña, y sendBeacon no puede enviar la cabecera Authorization. Por lo mismo
el cuerpo puede llegar como text/plain (un Blob text/plain no dispara preflight CORS),
así que se lee el cuerpo crudo y se valida a mano en vez de declarar un body de FastAPI.
"""
import logging
from collections import Counter

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from app.config import settings
from app.telemetry_models import TelemetryBatch, TelemetryReceived

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


@router.post("/events", response_model=TelemetryReceived)
async def receive_events(request: Request) -> TelemetryReceived:
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Lote de telemetría demasiado grande")
    try:
        batch = TelemetryBatch.model_validate_json(body or b"{}")
    except ValidationError as error:
        # Mismo formato que los 422 de FastAPI, sin repetir el input (podría traer datos)
        raise HTTPException(
            status_code=422,
            detail=error.errors(include_input=False, include_url=False, include_context=False),
        ) from None

    counts = Counter(event.event_type for event in batch.events)
    logger.info(
        "telemetry batch received: %d events → %s (endpoint %s)",
        len(batch.events),
        ", ".join(f"{event_type}×{n}" for event_type, n in counts.most_common()),
        settings.TELEMETRY_ENDPOINT,
    )
    return TelemetryReceived(received=len(batch.events))
