"""job_runs: máquina de estados, lock vía `processing` e idempotencia por día."""
from datetime import UTC, date, datetime, timedelta

import pytest

from app import database
from app.services import job_runner as jr

JOB = "nightly_export"
DAY = date(2026, 11, 17)


@pytest.fixture
def engine():
    return database.engine


def test_pending_processing_completed(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    assert jr.get_run(engine, run_id).status == jr.PENDING

    jr.mark_processing(engine, run_id)
    run = jr.get_run(engine, run_id)
    assert run.status == jr.PROCESSING and run.started_at is not None
    assert jr.has_processing_lock(engine, JOB)

    jr.mark_completed(engine, run_id)
    run = jr.get_run(engine, run_id)
    assert run.status == jr.COMPLETED and run.finished_at is not None and run.error_message is None
    assert not jr.has_processing_lock(engine, JOB)  # terminar libera el lock


def test_failed_keeps_the_error_and_releases_the_lock(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    jr.mark_processing(engine, run_id)
    jr.mark_failed(engine, run_id, "RuntimeError: boom")
    run = jr.get_run(engine, run_id)
    assert run.status == jr.FAILED and run.error_message == "RuntimeError: boom"
    assert not jr.has_processing_lock(engine, JOB)


def test_processing_state_is_the_lock(engine):
    first = jr.create_run(engine, JOB, DAY)
    second = jr.create_run(engine, JOB, DAY)
    jr.mark_processing(engine, first)
    # El índice único parcial no deja una segunda fila processing del mismo job
    with pytest.raises(jr.LockHeldError):
        jr.mark_processing(engine, second)
    assert jr.get_run(engine, second).status == jr.PENDING
    jr.discard_pending(engine, second)
    assert jr.get_run(engine, second) is None
    # Otros jobs no se bloquean entre sí
    other = jr.create_run(engine, "otro_job", DAY)
    jr.mark_processing(engine, other)


def test_idempotency_is_per_target_date(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    jr.mark_processing(engine, run_id)
    assert not jr.has_completed_for_date(engine, JOB, DAY)  # processing no cuenta
    jr.mark_completed(engine, run_id)
    assert jr.has_completed_for_date(engine, JOB, DAY)
    assert not jr.has_completed_for_date(engine, JOB, DAY + timedelta(days=1))
    assert not jr.has_completed_for_date(engine, "otro_job", DAY)


def test_failed_run_does_not_count_as_done(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    jr.mark_processing(engine, run_id)
    jr.mark_failed(engine, run_id, "x")
    assert not jr.has_completed_for_date(engine, JOB, DAY)


def test_stale_processing_rows_are_failed(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    jr.mark_processing(engine, run_id)
    later = datetime.now(UTC) + timedelta(hours=7)
    assert jr.fail_stale_runs(engine, JOB, timedelta(hours=6), now=datetime.now(UTC)) == []
    assert jr.fail_stale_runs(engine, JOB, timedelta(hours=6), now=later) == [run_id]
    run = jr.get_run(engine, run_id)
    assert run.status == jr.FAILED and "huérfana" in run.error_message and "processing" in run.error_message
    assert not jr.has_processing_lock(engine, JOB)


def test_status_check_constraint(engine):
    run_id = jr.create_run(engine, JOB, DAY)
    with pytest.raises(Exception):  # noqa: B017 — IntegrityError del CHECK
        jr._update(engine, run_id, status="zombie")
