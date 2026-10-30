"""Acceso a la tabla incidents (data/incidents.json).

Las incidencias se identifican por "id" (uuid4 en string), no por el doc_id de TinyDB.
No lanza HTTPException: los errores de negocio son excepciones propias que el
router traduce (InvalidTransitionError → 400).
"""
import logging
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from pydantic import ValidationError
from tinydb import Query

from app.database import incidents_table
from app.incident_models import Incident, IncidentCreate
from incidents_core.incident_model import (
    ALLOWED_TRANSITIONS,
    BRANCHES,
    CATEGORIES,
    ORIGINS,
    STATUSES,
)

logger = logging.getLogger(__name__)

I = Query()

# El cambio de estado lee, comprueba la transición y escribe: sin lock, dos PATCH
# simultáneos podrían saltarse ALLOWED_TRANSITIONS
_write_lock = Lock()


class InvalidTransitionError(Exception):
    """La transición de estado no está en ALLOWED_TRANSITIONS."""

    def __init__(self, current: str | None, new: str):
        # .get(): un registro corrupto puede traer un estado desconocido o ninguno
        allowed = sorted(ALLOWED_TRANSITIONS.get(current, ()))
        if allowed:
            reason = f"desde «{current}» solo se puede pasar a: {', '.join(allowed)}"
        elif current in ALLOWED_TRANSITIONS:
            reason = f"«{current}» es un estado final"
        else:
            reason = "el estado actual de la incidencia no es válido"
        super().__init__(f"No se puede pasar de «{current}» a «{new}»: {reason}")
        self.current = current
        self.new = new
        self.allowed = allowed


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_incident(data: IncidentCreate) -> dict:
    """Toda incidencia nueva empieza en open, con created_at = updated_at."""
    now = _now()
    incident = {
        "id": str(uuid4()),
        **data.model_dump(mode="json"),
        "status": "open",
        "created_at": now,
        "updated_at": now,
    }
    incidents_table.insert(incident)
    return incident


def list_incidents(
    status: str | None = None,
    origin: str | None = None,
    branch: str | None = None,
    category: str | None = None,
) -> list[dict]:
    """Filtros opcionales combinados con AND. Las más recientes primero."""
    filters = {"status": status, "origin": origin, "branch": branch, "category": category}
    active = {field: value for field, value in filters.items() if value is not None}

    docs = incidents_table.search(I.fragment(active)) if active else incidents_table.all()
    incidents = []
    for doc in docs:
        try:
            Incident.model_validate(dict(doc))
        except ValidationError:
            # Un registro corrupto no tumba el listado: se omite y se avisa (solo el id)
            logger.warning("Incidencia con datos no válidos omitida del listado: %s", doc.get("id"))
            continue
        incidents.append(dict(doc))
    return sorted(incidents, key=lambda d: d.get("created_at") or "", reverse=True)


def get_incident(incident_id: str) -> dict | None:
    doc = incidents_table.get(I.id == incident_id)
    return dict(doc) if doc is not None else None


def incidents_summary() -> dict:
    """Totales por status, category, origin y branch. Siempre con todas las claves."""
    by_status = {key: 0 for key in STATUSES}
    by_category = {key: 0 for key in CATEGORIES}
    by_origin = {key: 0 for key in ORIGINS}
    by_branch = {key: 0 for key in BRANCHES}

    docs = incidents_table.all()
    for doc in docs:
        # .get(): un registro corrupto (clave ausente o valor desconocido) no suma en
        # ese desglose, pero no tumba el resumen
        for counts, field in (
            (by_status, "status"),
            (by_category, "category"),
            (by_origin, "origin"),
            (by_branch, "branch"),
        ):
            value = doc.get(field)
            if value in counts:
                counts[value] += 1

    return {
        "total": len(docs),
        "by_status": by_status,
        "by_category": by_category,
        "by_origin": by_origin,
        "by_branch": by_branch,
    }


def change_status(incident_id: str, new_status: str) -> dict | None:
    """Aplica la transición y actualiza updated_at. None si la incidencia no existe."""
    with _write_lock:
        incident = get_incident(incident_id)
        if incident is None:
            return None

        current = incident.get("status")
        if new_status not in ALLOWED_TRANSITIONS.get(current, ()):
            raise InvalidTransitionError(current, new_status)

        incidents_table.update({"status": new_status, "updated_at": _now()}, I.id == incident_id)

    return get_incident(incident_id)
