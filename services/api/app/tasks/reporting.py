"""Tarea: recalcular el Reporte Semanal de Desempeño (pipeline de Prefect del Hito 6).

Es la operación más lenta de la API: arranca un flow de Prefect que lee la telemetría,
calcula los KPIs y escribe en `reporting` (entre 5 s y más de 20 s la primera vez, porque
Prefect levanta su servidor temporal). Antes corría con BackgroundTasks dentro del proceso
de uvicorn; ahora la API solo la encola.

Mensaje: `run_id` (uuid en texto) y `trigger`. Nada de datos: el worker los lee de la BD.
"""
import logging
from uuid import UUID, uuid4

from app.celery_app import ResilientTask, celery_app

logger = logging.getLogger("nexova.tasks")


@celery_app.task(bind=True, base=ResilientTask, name="reporting.run_weekly_pipeline")
def run_weekly_pipeline(self, run_id: str, trigger: str = "manual") -> dict:
    """Corre el flow. Cada intento deja su propia fila en reporting.pipeline_runs: el primero
    con el `run_id` que devolvió la API y los reintentos con uno nuevo."""
    from pipelines.pipeline import weekly_office_program_performance

    attempt_run_id = UUID(run_id) if self.request.retries == 0 else uuid4()
    try:
        return weekly_office_program_performance(trigger=trigger, run_id=attempt_run_id)
    except Exception as exc:
        raise self.retry_with_backoff(exc) from exc
