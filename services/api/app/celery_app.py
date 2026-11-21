"""Cola de tareas de Nexova (ticket DEV-55): Celery con Redis como broker y result backend.

    Cliente → API (productor) → Redis (broker) → worker de Celery (consumidor) → resultado

- La API solo encola (`apply_async`) y responde `202` con el `task_id`; nunca ejecuta la tarea.
- El worker es otro proceso (`celery -A app.celery_app worker`, o el servicio `worker` de
  docker-compose): parar la API no para el worker ni pierde los mensajes, que esperan en Redis.
- Mensajes ligeros: solo ids y parámetros pequeños (json), nunca datos.
- ACK tras el éxito (`acks_late`): si el worker muere a mitad, el mensaje vuelve a la cola.
- Toda tarea tiene timeout (`task_time_limit`).
- Reintentos con backoff exponencial y, tras agotarlos, Dead Letter Queue en la tabla
  `task_dead_letters` (app/services/task_dead_letters.py).

Variables: REDIS_URL, TASK_RETRY_BASE_SECONDS y, solo en tests, CELERY_TASK_ALWAYS_EAGER.
"""
import logging
import time

from celery import Celery, Task
from celery.signals import task_failure, task_postrun, task_prerun, task_retry

from app.config import settings

logger = logging.getLogger("nexova.tasks")

MAX_RETRIES = 3
# Una ejecución del pipeline tarda segundos; 30 min es el techo para no bloquear el pool
TASK_SOFT_TIME_LIMIT = 25 * 60
TASK_TIME_LIMIT = 30 * 60

celery_app = Celery("nexova", broker=settings.REDIS_URL, backend=settings.REDIS_URL, include=["app.tasks.reporting"])
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Estado `started` visible en GET /tasks/{task_id} (por defecto Celery salta de pending a success)
    task_track_started=True,
    # Guarda nombre, args y nº de reintentos con el resultado (GET /tasks/{task_id} los devuelve)
    result_extended=True,
    result_expires=7 * 24 * 3600,
    # ACK solo tras terminar; si el proceso del worker muere, el mensaje se reentrega
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    # Un mensaje cada vez por proceso: una tarea larga no retiene otras en su buffer
    worker_prefetch_multiplier=1,
    task_soft_time_limit=TASK_SOFT_TIME_LIMIT,
    task_time_limit=TASK_TIME_LIMIT,
    # Redis reentrega un mensaje sin ACK pasado este tiempo: tiene que ser mayor que el timeout
    broker_transport_options={"visibility_timeout": TASK_TIME_LIMIT + 10 * 60},
    broker_connection_retry_on_startup=True,
    # Eventos para Flower
    worker_send_task_events=True,
    task_send_sent_event=True,
    # Tests: la tarea corre en el proceso que la encola y su resultado queda consultable
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=False,
    task_store_eager_result=True,
)
if settings.CELERY_TASK_ALWAYS_EAGER:
    # Sin Redis: resultados en memoria del propio proceso
    celery_app.conf.result_backend = "cache+memory://"


def backoff_seconds(retries: int) -> float:
    """Espera antes del reintento nº `retries + 1`: base · 2^retries (10 s, 20 s, 40 s)."""
    return settings.TASK_RETRY_BASE_SECONDS * (2**retries)


class ResilientTask(Task):
    """Base de las tareas de Nexova: hasta MAX_RETRIES reintentos con backoff exponencial.
    Al agotarlos la tarea termina en FAILURE y la señal `task_failure` la registra en la DLQ."""

    max_retries = MAX_RETRIES

    def retry_with_backoff(self, exc: Exception):
        countdown = backoff_seconds(self.request.retries)
        # Con los reintentos agotados, retry() relanza `exc`: la tarea pasa a FAILURE
        return self.retry(exc=exc, countdown=countdown, max_retries=self.max_retries)


# --- Logs: task_id, intento, estado y duración de cada ejecución ------------------------------

_started: dict[str, float] = {}


def _attempt(task) -> int:
    return (task.request.retries or 0) + 1 if task is not None else 0


@task_prerun.connect
def _on_prerun(task_id=None, task=None, **_kwargs):
    _started[task_id] = time.monotonic()
    logger.info("task_id=%s task=%s attempt=%s status=started", task_id, task.name, _attempt(task))


@task_postrun.connect
def _on_postrun(task_id=None, task=None, state=None, **_kwargs):
    duration = time.monotonic() - _started.pop(task_id, time.monotonic())
    logger.info(
        "task_id=%s task=%s attempt=%s status=%s duration=%.2fs",
        task_id, task.name, _attempt(task), (state or "unknown").lower(), duration,
    )


@task_retry.connect
def _on_retry(request=None, reason=None, einfo=None, **_kwargs):
    attempt = (request.retries or 0) + 1
    countdown = backoff_seconds(request.retries or 0)
    logger.warning(
        "task_id=%s task=%s attempt=%s status=retry next_in=%.0fs error=%r",
        request.id, request.task, attempt, countdown, str(reason),
    )


@task_failure.connect
def _on_failure(sender=None, task_id=None, exception=None, args=None, kwargs=None, einfo=None, **_kwargs):
    """Fallo definitivo (reintentos agotados o error no reintentable): log con la traza
    completa y registro en la Dead Letter Queue."""
    attempt = _attempt(sender)
    logger.error(
        "task_id=%s task=%s attempt=%s status=failure error=%r\n%s",
        task_id, getattr(sender, "name", "?"), attempt, str(exception), einfo.traceback if einfo else "",
    )
    from app.services import task_dead_letters

    try:
        task_dead_letters.record(
            task_id=task_id,
            task_name=getattr(sender, "name", "?"),
            attempts=attempt,
            error_message=f"{type(exception).__name__}: {exception}",
            task_args={"args": list(args or []), "kwargs": dict(kwargs or {})},
        )
    except Exception:  # pragma: no cover — la BD caída no debe tapar el error original
        logger.exception("task_id=%s no se pudo registrar en la DLQ", task_id)
