"""Cola de tareas (DEV-55): reintentos con backoff, Dead Letter Queue y GET /tasks/{task_id}.

Celery corre en modo eager (conftest): la tarea se ejecuta en el propio proceso y los
reintentos se encadenan sin esperar. La prueba con Redis y un worker real está documentada
en docs/background-jobs/message-queue.md.
"""
import logging

import pytest
from pipelines import pipeline as pipeline_module

from app import celery_app as celery_module
from app import database
from app.auth_models import Role
from app.services import task_dead_letters
from app.tasks.reporting import run_weekly_pipeline


@pytest.fixture
def admin_headers(client, auth_headers):
    user = database.users_table.all()[0]
    database.users_table.update({"role": Role.ADMIN.value}, doc_ids=[user.doc_id])
    return auth_headers


def test_backoff_is_exponential(monkeypatch):
    monkeypatch.setattr(celery_module.settings, "TASK_RETRY_BASE_SECONDS", 10)
    assert [celery_module.backoff_seconds(n) for n in range(3)] == [10, 20, 40]


def test_task_configuration():
    conf = celery_module.celery_app.conf
    assert run_weekly_pipeline.max_retries == 3
    assert conf.task_acks_late and conf.task_reject_on_worker_lost
    assert conf.task_time_limit and conf.task_soft_time_limit
    assert conf.broker_transport_options["visibility_timeout"] > conf.task_time_limit
    assert conf.task_track_started


def test_success_is_queryable(client, admin_headers, monkeypatch):
    monkeypatch.setattr(
        pipeline_module, "weekly_office_program_performance",
        lambda trigger, run_id: {"run_id": str(run_id), "rows_upserted": 3},
    )
    accepted = client.post("/reporting/pipeline-runs", headers=admin_headers).json()
    body = client.get(f"/tasks/{accepted['task_id']}", headers=admin_headers).json()
    assert body["status"] == "success"
    assert body["result"] == {"run_id": accepted["run_id"], "rows_upserted": 3}
    assert body["task_name"] == "reporting.run_weekly_pipeline"
    assert body["retries"] == 0 and body["dead_letter"] is None


def test_transient_failure_is_retried_then_succeeds(client, admin_headers, monkeypatch, caplog):
    attempts = []

    def flaky(trigger, run_id):
        attempts.append(run_id)
        if len(attempts) < 3:
            raise ConnectionError("Supabase no responde")
        return {"run_id": str(run_id)}

    monkeypatch.setattr(pipeline_module, "weekly_office_program_performance", flaky)
    caplog.set_level(logging.INFO, logger="nexova.tasks")
    accepted = client.post("/reporting/pipeline-runs", headers=admin_headers).json()

    assert len(attempts) == 3
    assert str(attempts[0]) == accepted["run_id"]  # el primer intento usa el run_id devuelto
    assert len({str(a) for a in attempts}) == 3  # cada reintento, su propia fila en pipeline_runs
    assert task_dead_letters.latest() == []
    logs = caplog.text
    assert "attempt=1 status=retry" in logs and "attempt=2 status=retry" in logs
    assert "Supabase no responde" in logs


def test_exhausted_retries_end_in_the_dead_letter_queue(client, admin_headers, monkeypatch, caplog):
    attempts = []

    def broken(trigger, run_id):
        attempts.append(run_id)
        raise RuntimeError("Prefect caído")

    monkeypatch.setattr(pipeline_module, "weekly_office_program_performance", broken)
    caplog.set_level(logging.INFO, logger="nexova.tasks")
    res = client.post("/reporting/pipeline-runs", headers=admin_headers)
    assert res.status_code == 202  # la API responde igual: el fallo es de la tarea
    task_id = res.json()["task_id"]

    assert len(attempts) == 4  # 1 intento + max_retries=3 reintentos
    [letter] = task_dead_letters.latest()
    assert letter.task_id == task_id
    assert letter.task_name == "reporting.run_weekly_pipeline"
    assert letter.attempts == 4
    assert letter.error_message == "RuntimeError: Prefect caído"
    assert letter.task_args["kwargs"]["run_id"] == res.json()["run_id"]

    body = client.get(f"/tasks/{task_id}", headers=admin_headers).json()
    assert body["status"] == "failure"
    assert "Prefect caído" in body["error"]
    assert body["dead_letter"]["attempts"] == 4
    assert "attempt=4 status=failure" in caplog.text and "Traceback" in caplog.text

    dlq = client.get("/tasks/dead-letters", headers=admin_headers).json()
    assert [d["task_id"] for d in dlq] == [task_id]


def test_dead_letter_is_recorded_once_per_task():
    assert task_dead_letters.record("t-1", "x", 4, "Error: a", {"args": [], "kwargs": {}})
    assert not task_dead_letters.record("t-1", "x", 4, "Error: a", {"args": [], "kwargs": {}})
    assert len(task_dead_letters.latest()) == 1


def test_unknown_task_is_pending(client, auth_headers):
    body = client.get("/tasks/no-existe", headers=auth_headers).json()
    assert body["status"] == "pending"


def test_dead_letters_require_admin_or_manager(client, auth_headers):
    assert client.get("/tasks/dead-letters", headers=auth_headers).status_code == 403


def test_tasks_require_login(client):
    assert client.get("/tasks/abc").status_code == 401


def test_message_carries_only_ids(client, admin_headers, monkeypatch):
    sent = {}

    def capture(*args, **kwargs):
        sent.update(kwargs)
        raise_ = type("R", (), {"id": "t-123"})
        return raise_()

    monkeypatch.setattr(run_weekly_pipeline, "apply_async", capture)
    client.post("/reporting/pipeline-runs", headers=admin_headers)
    assert set(sent["kwargs"]) == {"run_id", "trigger"}
