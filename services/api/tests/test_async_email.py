"""Email de recuperación fuera del ciclo petición-respuesta (proyecto async-processing).

Celery corre en modo eager (conftest): la tarea se ejecuta en el propio proceso y los
reintentos se encadenan sin esperar. Resend se sustituye por una función que cuenta envíos
por clave de idempotencia (como haría Resend con la cabecera Idempotency-Key).
"""
import logging
from datetime import UTC, datetime, timedelta

import pytest

from app import database
from app.auth_models import Role
from app.services import email as email_service
from app.services import email_outbox as outbox
from app.services import task_dead_letters
from app.tasks import email as email_tasks

EMAIL = "async@example.com"
URL = "http://localhost:3001/reset-password?token=abc"


class FakeResend:
    """Proveedor externo simulado: `failures` errores seguidos y después acepta."""

    def __init__(self, failures: int = 0):
        self.failures = failures
        self.calls: list[dict] = []

    def __call__(self, to, reset_url, idempotency_key=None):
        self.calls.append({"to": to, "url": reset_url, "key": idempotency_key})
        if len(self.calls) <= self.failures:
            raise ConnectionError("Resend: 503 Service Unavailable")
        return f"re_{len(self.calls)}"

    def delivered(self) -> int:
        """Envíos que el proveedor aceptó, contando una vez cada clave (como Resend)."""
        return len({c["key"] for c in self.calls[self.failures:]})


@pytest.fixture
def resend_ok(monkeypatch):
    fake = FakeResend()
    monkeypatch.setattr(email_service, "send_password_reset_email", fake)
    return fake


@pytest.fixture
def admin_headers(client, auth_headers):
    user = database.users_table.all()[0]
    database.users_table.update({"role": Role.ADMIN.value}, doc_ids=[user.doc_id])
    return auth_headers


def test_forgot_password_goes_through_the_queue(client, register_user, resend_ok):
    register_user(EMAIL, "Password123")
    assert client.post("/auth/forgot-password", json={"email": EMAIL}).status_code == 200

    [delivery] = outbox.latest()
    assert delivery.status == outbox.COMPLETED
    assert delivery.attempts == 1 and delivery.recipient == EMAIL
    assert delivery.idempotency_key.startswith("password_reset:")
    assert delivery.task_id and delivery.provider_message_id == "re_1"
    assert delivery.payload == {}  # el enlace con el token no se queda guardado
    assert resend_ok.calls[0]["key"] == delivery.idempotency_key
    assert "token=" in resend_ok.calls[0]["url"]


def test_unknown_email_enqueues_nothing(client, resend_ok):
    assert client.post("/auth/forgot-password", json={"email": "nadie@example.com"}).status_code == 200
    assert outbox.latest() == [] and resend_ok.calls == []


def test_same_idempotency_key_twice_sends_once(resend_ok):
    """Prueba de idempotencia: encolar la misma operación dos veces con la misma clave."""
    first = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-1")
    second = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-1")
    assert first.id == second.id
    assert len(outbox.latest()) == 1
    assert len(resend_ok.calls) == 1  # un solo envío al proveedor
    # Otra clave sí es otra operación
    email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-2")
    assert len(resend_ok.calls) == 2


def test_duplicate_message_for_the_same_delivery_is_skipped(resend_ok):
    """Reentrega del mismo mensaje (p. ej. el worker murió tras enviar y antes del ACK)."""
    delivery = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-3")
    result = email_tasks.send_delivery.apply(kwargs={"delivery_id": str(delivery.id)}).get()
    assert result["status"] == "skipped_duplicate"
    assert len(resend_ok.calls) == 1


def test_provider_outage_is_retried_with_backoff_and_recovers(monkeypatch, caplog):
    fake = FakeResend(failures=2)
    monkeypatch.setattr(email_service, "send_password_reset_email", fake)
    caplog.set_level(logging.INFO, logger="nexova.tasks")

    delivery = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-4")
    delivery = outbox.get(delivery.id)
    assert delivery.status == outbox.COMPLETED
    assert delivery.attempts == 3  # 2 fallos + el envío bueno
    assert delivery.last_error is None
    assert {c["key"] for c in fake.calls} == {"password_reset:clave-4"}  # misma clave en cada intento
    assert fake.delivered() == 1
    assert "attempt=1 status=retry" in caplog.text and "attempt=2 status=retry" in caplog.text
    assert task_dead_letters.latest() == []


def test_persistent_outage_ends_failed_and_in_the_dlq(monkeypatch, client, admin_headers):
    fake = FakeResend(failures=99)
    monkeypatch.setattr(email_service, "send_password_reset_email", fake)

    delivery = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-5")
    delivery = outbox.get(delivery.id)
    assert len(fake.calls) == 4  # 1 + 3 reintentos
    assert delivery.status == outbox.FAILED and delivery.attempts == 4
    assert "503 Service Unavailable" in delivery.last_error
    assert delivery.payload == {}
    [letter] = task_dead_letters.latest()
    assert letter.task_id == delivery.task_id and letter.task_name == "emails.send_delivery"
    assert letter.attempts == 4
    assert letter.task_args["kwargs"] == {"delivery_id": str(delivery.id)}  # solo el id

    # Consultable por la API: el envío y la tarea
    body = client.get(f"/email-deliveries/{delivery.id}", headers=admin_headers).json()
    assert body["status"] == "failed" and body["attempts"] == 4
    assert "payload" not in body and "reset_url" not in str(body)
    failed = client.get("/email-deliveries?status=failed", headers=admin_headers).json()
    assert [d["id"] for d in failed] == [str(delivery.id)]
    task = client.get(f"/tasks/{delivery.task_id}", headers=admin_headers).json()
    assert task["status"] == "failure" and task["retries"] == 3


def test_without_resend_key_completes_without_retrying(monkeypatch):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", None)
    delivery = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-6")
    delivery = outbox.get(delivery.id)
    assert delivery.status == outbox.COMPLETED and delivery.attempts == 1
    assert "RESEND_API_KEY" in delivery.last_error


def test_queue_down_leaves_a_visible_failure(monkeypatch, resend_ok):
    from kombu.exceptions import OperationalError

    def down(*_args, **_kwargs):
        raise OperationalError("Error 111 connecting to localhost:6379")

    monkeypatch.setattr(email_tasks.send_delivery, "apply_async", down)
    delivery = email_tasks.enqueue_password_reset(EMAIL, URL, "password_reset:clave-7")
    assert delivery.status == outbox.FAILED and "Cola de tareas no disponible" in delivery.last_error
    assert resend_ok.calls == []


def test_claim_only_once_and_stale_claim_is_retaken():
    delivery, _ = outbox.create("k-claim", "password_reset", EMAIL, {"reset_url": URL})
    assert outbox.claim(delivery.id)
    assert not outbox.claim(delivery.id)  # otro worker con el mismo mensaje no la toma
    later = datetime.now(UTC) + outbox.CLAIM_LEASE + timedelta(minutes=1)
    assert outbox.claim(delivery.id, now=later)  # worker muerto: la fila no se queda colgada
    assert outbox.get(delivery.id).attempts == 2


def test_email_deliveries_require_admin_or_manager(client, auth_headers):
    assert client.get("/email-deliveries", headers=auth_headers).status_code == 403
