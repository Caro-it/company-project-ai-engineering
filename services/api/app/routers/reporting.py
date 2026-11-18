"""Endpoints del Reporte Semanal de Desempeño por Oficina y Programa (Hito 6).

Contrato: docs/CONTEXT-data-pipelines-nexova.md §6 · Diseño: data/pipelines/PIPELINE_DESIGN.md §5

- La lógica vive en data/pipelines/ (pipelines.queries y el flow de Prefect): este router solo
  la importa. Nunca escribe en telemetry_events ni toca GET /telemetry/report.
- Mismo esquema de autenticación que el resto de la API (Bearer). Disparar el pipeline queda
  para admin y manager.
"""
from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from kombu.exceptions import OperationalError
from pipelines import queries
from pydantic import BaseModel

from app import database
from app.auth_models import Role
from app.deps import get_current_user

router = APIRouter(prefix="/reporting", tags=["reporting"], dependencies=[Depends(get_current_user)])


class WeeklyEntry(BaseModel):
    office: str
    programme_id: str
    total_material_cost: float
    kits_delivered_count: int
    shortage_events_count: int
    cost_variance_events_count: int
    currency: str


class WeeklyPerformance(BaseModel):
    week_start: date | None
    entries: list[WeeklyEntry]


class PipelineRun(BaseModel):
    run_id: str
    pipeline: str
    flow_run_id: str | None
    trigger: str
    status: str
    started_at: str
    finished_at: str | None
    window_start: date
    window_end: date
    environment: str
    events_extracted: int | None
    events_discarded: int | None
    rows_upserted: int | None
    failed_phase: str | None
    error_message: str | None


class RunAccepted(BaseModel):
    task_id: str
    run_id: str
    status: str


@router.get("/weekly-office-program-performance", response_model=WeeklyPerformance)
def weekly_office_program_performance(week_start: date | None = None) -> dict:
    """Todas las combinaciones oficina/programa de una semana (por defecto la más reciente)."""
    if week_start is not None and week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start debe ser un lunes (semana ISO)")
    return queries.get_weekly_performance(database.engine, week_start)


@router.get("/weeks", response_model=list[date])
def weeks() -> list[str]:
    """Semanas ya calculadas, de la más reciente a la más antigua (para el dashboard)."""
    return queries.list_weeks(database.engine)


@router.get("/pipeline-runs/latest", response_model=PipelineRun)
def latest_pipeline_run() -> dict:
    run = queries.get_latest_run(database.engine)
    if run is None:
        raise HTTPException(status_code=404, detail="El pipeline todavía no se ha ejecutado")
    return run


@router.post("/pipeline-runs", response_model=RunAccepted, status_code=202)
def trigger_pipeline_run(current_user: dict = Depends(get_current_user)) -> RunAccepted:
    """Disparo manual. Encola la tarea de Celery y responde 202 al momento con el `task_id`
    (estado en GET /tasks/{task_id}) y el `run_id` (fila de pipeline_runs del primer intento).
    La API nunca ejecuta el pipeline: lo hace un worker."""
    from app.tasks.reporting import run_weekly_pipeline

    if current_user["role"] not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status_code=403, detail="Solo admin o manager pueden ejecutar el pipeline")
    if queries.has_running_run(database.engine):
        raise HTTPException(status_code=409, detail="Ya hay una ejecución del pipeline en curso")
    run_id = str(uuid4())
    try:
        # retry=False: si Redis no responde, error al momento en vez de colgar la petición
        task = run_weekly_pipeline.apply_async(kwargs={"run_id": run_id, "trigger": "manual"}, retry=False)
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail="La cola de tareas no está disponible") from exc
    return RunAccepted(task_id=task.id, run_id=run_id, status="pending")
