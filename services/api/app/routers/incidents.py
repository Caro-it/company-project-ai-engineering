import csv

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app.deps import get_current_user
from app.errors import ApiError
from app.incident_models import Incident, IncidentCreate, IncidentStatusUpdate
from app.services.incidents import (
    InvalidTransitionError,
    change_status,
    create_incident,
    get_incident,
    incidents_summary,
    list_incidents,
)
from incidents_core.analysis import analyze_rows
from incidents_core.constants import RULES
from incidents_core.export import summary_to_csv
from incidents_core.incident_model import Branch, Category, Origin, Status
from incidents_core.validation import parse_rows

router = APIRouter(
    prefix="/api/incidents",
    tags=["incidents"],
    dependencies=[Depends(get_current_user)],
)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Último análisis en memoria (se pierde al reiniciar el servidor)
_last_summary: dict | None = None


@router.post("/analyze")
async def analyze_incidents(file: UploadFile = File(...)) -> dict:
    global _last_summary

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="El fichero debe tener extensión .csv.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El fichero está vacío.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El fichero supera el tamaño máximo de 50 MB.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="El fichero no está codificado en UTF-8.") from None

    try:
        rows = parse_rows(text)
    except ValueError as error:
        # Los mensajes de parse_rows nunca incluyen datos de registros
        raise HTTPException(status_code=422, detail=str(error)) from None
    except csv.Error:
        # p. ej. un campo que supera el límite del módulo csv. Sin el mensaje original
        raise HTTPException(
            status_code=422,
            detail="El fichero CSV está mal formado y no se ha podido leer.",
        ) from None

    summary = analyze_rows(rows)
    _last_summary = summary

    return {
        "filename": file.filename,
        "summary": summary,
        "invalid_rule_labels": RULES,
    }


@router.get("/results/export")
def export_results() -> Response:
    if _last_summary is None:
        raise HTTPException(
            status_code=404,
            detail="Todavía no hay ningún análisis. Sube un CSV primero.",
        )
    return Response(
        content=summary_to_csv(_last_summary),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="results.csv"'},
    )


# --- Gestor de incidencias (docs/CONTEXT-incident-manager-nexova.md) ---
# Los errores de validación de estas rutas son 400 (ver app/errors.py)


def _not_found() -> ApiError:
    # Detail fijo: no se repite el id recibido
    return ApiError(404, "not_found", "Incidencia no encontrada")


@router.post("", response_model=Incident, status_code=201)
def create(payload: IncidentCreate):
    """Alta de incidencia. Siempre empieza en open."""
    return create_incident(payload)


@router.get("", response_model=list[Incident])
def read_incidents(
    status: Status | None = None,
    origin: Origin | None = None,
    branch: Branch | None = None,
    category: Category | None = None,
):
    """Listado con filtros opcionales. Con la BD vacía devuelve []."""
    return list_incidents(status=status, origin=origin, branch=branch, category=category)


# Antes de /{incident_id}: si no, "summary" se tomaría como un id
@router.get("/summary")
def read_summary() -> dict:
    """Totales por status, category, origin y branch, con todas las claves aunque valgan 0."""
    return incidents_summary()


@router.get("/{incident_id}", response_model=Incident)
def read_incident(incident_id: str):
    incident = get_incident(incident_id)
    if incident is None:
        raise _not_found()
    return incident


@router.patch("/{incident_id}/status", response_model=Incident)
def update_status(incident_id: str, payload: IncidentStatusUpdate):
    """Solo transiciones de ALLOWED_TRANSITIONS. Actualiza updated_at."""
    try:
        incident = change_status(incident_id, payload.status)
    except InvalidTransitionError as error:
        raise ApiError(
            400, "invalid_transition", str(error),
            **{"from": error.current, "to": error.new, "allowed": error.allowed},
        ) from None
    if incident is None:
        raise _not_found()
    return incident
