"""Tarea: enviar un email de la bandeja de salida (`email_deliveries`) con Resend.

Antes el email de recuperación se enviaba con BackgroundTasks dentro del proceso de la API:
si Resend estaba caído unos minutos, el envío fallaba, se escribía en el log y se perdía.
Ahora la API solo registra el envío y lo encola; este worker lo intenta hasta 4 veces
(1 + 3 reintentos con backoff 10/20/40 s) y, si sigue fallando, queda `failed` en
`email_deliveries` y en la Dead Letter Queue (`task_dead_letters`).

Mensaje: solo `delivery_id`. El destinatario y el enlace los lee el worker de la BD.
"""
import logging
from uuid import UUID

from app.celery_app import ResilientTask, celery_app
from app.services import email as email_service
from app.services import email_outbox as outbox

logger = logging.getLogger("nexova.tasks")


@celery_app.task(bind=True, base=ResilientTask, name="emails.send_delivery")
def send_delivery(self, delivery_id: str) -> dict:
    delivery_uuid = UUID(delivery_id)
    delivery = outbox.get(delivery_uuid)
    if delivery is None:
        return {"delivery_id": delivery_id, "status": "missing"}
    # Idempotencia: si otro intento (o un mensaje duplicado) ya lo envió, no se repite
    if delivery.status == outbox.COMPLETED:
        logger.info("task_id=%s delivery_id=%s status=skipped_duplicate", self.request.id, delivery_id)
        return {"delivery_id": delivery_id, "status": "skipped_duplicate"}
    if not outbox.claim(delivery_uuid):
        logger.info("task_id=%s delivery_id=%s status=skipped_claimed", self.request.id, delivery_id)
        return {"delivery_id": delivery_id, "status": f"skipped_{delivery.status}"}

    try:
        if delivery.kind != "password_reset":
            raise ValueError(f"Tipo de email desconocido: {delivery.kind}")
        provider_id = email_service.send_password_reset_email(
            delivery.recipient, delivery.payload["reset_url"], idempotency_key=delivery.idempotency_key
        )
    except email_service.EmailNotConfiguredError as exc:
        # Desarrollo sin Resend: igual que antes, aviso y fin (no tiene sentido reintentar)
        logger.warning("delivery_id=%s %s", delivery_id, exc)
        outbox.mark_completed(delivery_uuid, None, note=str(exc))
        return {"delivery_id": delivery_id, "status": "completed", "sent": False}
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
        if self.request.retries >= self.max_retries:
            outbox.mark_failed(delivery_uuid, error)
        else:
            outbox.release_for_retry(delivery_uuid, error)
        raise self.retry_with_backoff(exc) from exc

    outbox.mark_completed(delivery_uuid, provider_id)
    return {"delivery_id": delivery_id, "status": "completed", "sent": True, "provider_message_id": provider_id}


def enqueue_password_reset(recipient: str, reset_url: str, idempotency_key: str) -> outbox.EmailDelivery:
    """Productor: registra el envío y lo encola. Con una clave ya registrada no crea otra
    fila ni otro mensaje: devuelve la existente."""
    from kombu.exceptions import OperationalError

    delivery, created = outbox.create(idempotency_key, "password_reset", recipient, {"reset_url": reset_url})
    if not created:
        logger.info("delivery_id=%s status=duplicate_enqueue idempotency_key ya registrada", delivery.id)
        return delivery
    try:
        task = send_delivery.apply_async(kwargs={"delivery_id": str(delivery.id)}, retry=False)
    except OperationalError as exc:
        # Sin cola no hay envío, pero el fallo queda visible en email_deliveries
        outbox.mark_failed(delivery.id, f"Cola de tareas no disponible: {exc}")
        logger.exception("delivery_id=%s no se pudo encolar", delivery.id)
        return outbox.get(delivery.id)
    outbox.set_task_id(delivery.id, task.id)
    return outbox.get(delivery.id)
