"""scripts/nightly_export.py como proceso: export CSV, pipeline, job_runs, lock e idempotencia.

Cada test usa una BD SQLite en archivo propia (no la de los demás tests) y sustituye el
pipeline por un comando corto con NIGHTLY_PIPELINE_CMD.
"""
import csv
import importlib.util
import json
import os
import shlex
import subprocess
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, insert

from app.services import job_runner as jr
from app.telemetry_store import TelemetryEventRecord

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "scripts" / "nightly_export.py"
DAY = date(2026, 11, 17)

_spec = importlib.util.spec_from_file_location("nightly_export", SCRIPT)
nightly = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nightly)

OK = f"{shlex.quote(sys.executable)} -c \"print('ok')\""
FAIL = f"{shlex.quote(sys.executable)} -c \"import sys; sys.exit('pipeline roto')\""
MARKER_CMD = (
    f"{shlex.quote(sys.executable)} -c \"import os, time; time.sleep(float(os.environ.get('SLEEP', '0'))); "
    "open(os.environ['MARKER'], 'a').write('x')\""
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'nexova.db'}"
    engine = create_engine(url)
    TelemetryEventRecord.__table__.create(engine)
    events = [
        (datetime(2026, 11, 16, 23, 59, 59, tzinfo=UTC), "page_viewed"),  # día anterior
        (datetime(2026, 11, 17, 0, 0, tzinfo=UTC), "page_viewed"),
        (datetime(2026, 11, 17, 12, 30, tzinfo=UTC), "user_login_failed"),
        (datetime(2026, 11, 17, 23, 59, 59, tzinfo=UTC), "outbound_order_created"),
        (datetime(2026, 11, 18, 0, 0, tzinfo=UTC), "page_viewed"),  # día siguiente
    ]
    with engine.begin() as connection:
        connection.execute(
            insert(TelemetryEventRecord.__table__),
            [
                {"id": uuid4(), "timestamp": ts, "service": "backoffice", "event_type": kind,
                 "level": "warn" if kind == "user_login_failed" else "info", "value": None,
                 "message": kind, "tags": {"office": "Valencia", "n": i}}
                for i, (ts, kind) in enumerate(events)
            ],
        )
    engine.dispose()
    values = {
        "DATABASE_URL": url,
        "TARGET_DATE": DAY.isoformat(),
        "NIGHTLY_EXPORT_DIR": str(tmp_path / "raw"),
        "NIGHTLY_PIPELINE_CMD": OK,
        "MARKER": str(tmp_path / "pipeline_runs.txt"),
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    return {"url": url, "dir": tmp_path / "raw", "marker": tmp_path / "pipeline_runs.txt"}


def _engine(url):
    return nightly.build_engine(url)


def _run_process(env_overrides: dict, **kwargs) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, str(SCRIPT)], env={**os.environ, **env_overrides},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, **kwargs,
    )


def test_target_date_defaults_to_yesterday_utc():
    assert nightly.resolve_target_date({}, today=date(2026, 11, 18)) == DAY
    assert nightly.resolve_target_date({"TARGET_DATE": "2026-01-02"}) == date(2026, 1, 2)
    with pytest.raises(ValueError, match="YYYY-MM-DD"):
        nightly.resolve_target_date({"TARGET_DATE": "17/11/2026"})


def test_pipeline_command_recomputes_the_week_of_the_target_date(monkeypatch):
    monkeypatch.delenv("NIGHTLY_PIPELINE_CMD", raising=False)
    command = nightly.pipeline_command(date(2026, 11, 19))  # jueves
    assert command[-4:] == ["--from-week", "2026-11-16", "--to-week", "2026-11-16"]
    assert "--trigger" in command and str(nightly.PIPELINE_SCRIPT) in command


def test_successful_run_exports_csv_runs_pipeline_and_completes(env, capsys):
    os.environ["NIGHTLY_PIPELINE_CMD"] = MARKER_CMD
    assert nightly.main() == 0

    path = env["dir"] / "telemetry_2026-11-17.csv"
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    assert [r["event_type"] for r in rows] == ["page_viewed", "user_login_failed", "outbound_order_created"]
    assert list(rows[0]) == nightly.CSV_COLUMNS
    assert rows[0]["timestamp"] == "2026-11-17T00:00:00.000000Z"
    assert json.loads(rows[1]["tags"]) == {"n": 2, "office": "Valencia"}
    assert env["marker"].read_text() == "x"

    [run] = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert run.status == jr.COMPLETED and run.target_date == DAY and run.error_message is None
    assert run.started_at and run.finished_at

    out = capsys.readouterr().out
    for status in ("pending", "processing", "completed"):
        assert f"job=nightly_export status={status} target_date=2026-11-17" in out


def test_second_run_same_day_is_skipped(env, capsys):
    os.environ["NIGHTLY_PIPELINE_CMD"] = MARKER_CMD
    assert nightly.main() == 0
    csv_file = env["dir"] / "telemetry_2026-11-17.csv"
    mtime = csv_file.stat().st_mtime_ns

    assert nightly.main() == 0
    assert csv_file.stat().st_mtime_ns == mtime  # el CSV no se reescribe
    assert env["marker"].read_text() == "x"  # el pipeline no se relanza
    assert len(jr.list_runs(_engine(env["url"]), "nightly_export")) == 1
    assert "status=skipped_duplicate" in capsys.readouterr().out


def test_other_day_runs_again(env, monkeypatch):
    assert nightly.main() == 0
    monkeypatch.setenv("TARGET_DATE", "2026-11-16")
    assert nightly.main() == 0
    runs = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert sorted(r.target_date for r in runs) == [date(2026, 11, 16), DAY]
    assert (env["dir"] / "telemetry_2026-11-16.csv").exists()


def test_existing_csv_is_not_overwritten(env):
    env["dir"].mkdir(parents=True)
    path = env["dir"] / "telemetry_2026-11-17.csv"
    path.write_text("ya estaba\n", encoding="utf-8")
    assert nightly.main() == 0
    assert path.read_text(encoding="utf-8") == "ya estaba\n"


def test_failed_pipeline_leaves_failed_not_processing(env, capsys):
    os.environ["NIGHTLY_PIPELINE_CMD"] = FAIL
    assert nightly.main() == 1
    [run] = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert run.status == jr.FAILED
    assert "pipeline roto" in run.error_message and run.finished_at is not None
    assert "ERROR job=nightly_export status=failed" in capsys.readouterr().out

    # Un fallo no cuenta como hecho: la siguiente ejecución lo reintenta
    os.environ["NIGHTLY_PIPELINE_CMD"] = OK
    assert nightly.main() == 0
    statuses = [r.status for r in jr.list_runs(_engine(env["url"]), "nightly_export")]
    assert statuses == [jr.FAILED, jr.COMPLETED]


def test_failure_while_exporting_also_marks_failed(env, monkeypatch):
    def boom(*_args, **_kwargs):
        raise OSError("disco lleno")

    monkeypatch.setattr(nightly, "export_telemetry_csv", boom)
    assert nightly.main() == 1
    [run] = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert run.status == jr.FAILED and "disco lleno" in run.error_message


def test_interruption_marks_failed(env, monkeypatch):
    def interrupted(*_args, **_kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(nightly, "run_pipeline", interrupted)
    with pytest.raises(KeyboardInterrupt):
        nightly.main()
    [run] = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert run.status == jr.FAILED and run.error_message == "interrumpido antes de terminar"


def test_running_instance_blocks_the_next_one(env, capsys):
    engine = _engine(env["url"])
    jr.ensure_job_runs_table(engine)
    run_id = jr.create_run(engine, "nightly_export", DAY - timedelta(days=1))
    jr.mark_processing(engine, run_id)

    assert nightly.main() == 0
    assert "status=skipped_locked" in capsys.readouterr().out
    assert not (env["dir"] / "telemetry_2026-11-17.csv").exists()
    assert [r.id for r in jr.list_runs(engine, "nightly_export")] == [run_id]


def test_orphaned_processing_row_is_failed_and_does_not_block(env, monkeypatch):
    engine = _engine(env["url"])
    jr.ensure_job_runs_table(engine)
    run_id = jr.create_run(engine, "nightly_export", DAY - timedelta(days=1))
    jr.mark_processing(engine, run_id)
    monkeypatch.setenv("JOB_STALE_AFTER_HOURS", "0")
    assert nightly.main() == 0
    statuses = {r.id: r.status for r in jr.list_runs(engine, "nightly_export")}
    assert statuses[run_id] == jr.FAILED
    assert list(statuses.values()).count(jr.COMPLETED) == 1


def test_two_simultaneous_processes_run_only_once(env):
    """Demostración del criterio: dos instancias a la vez → una trabaja y la otra aborta."""
    overrides = {"NIGHTLY_PIPELINE_CMD": MARKER_CMD, "SLEEP": "3"}
    first = _run_process(overrides)
    second = _run_process(overrides)
    outputs = [p.communicate(timeout=120)[0] for p in (first, second)]
    assert [p.returncode for p in (first, second)] == [0, 0], outputs

    joined = "\n".join(outputs)
    assert joined.count("status=completed") == 1
    assert joined.count("status=skipped_locked") == 1
    assert env["marker"].read_text() == "x"  # el pipeline corrió una sola vez
    runs = jr.list_runs(_engine(env["url"]), "nightly_export")
    assert [r.status for r in runs] == [jr.COMPLETED]  # sin filas pending ni processing colgadas


def test_sigterm_marks_failed(env):
    overrides = {"NIGHTLY_PIPELINE_CMD": MARKER_CMD, "SLEEP": "30"}
    process = _run_process(overrides)
    engine = _engine(env["url"])
    deadline = datetime.now(UTC) + timedelta(seconds=30)
    while datetime.now(UTC) < deadline:
        try:
            if jr.has_processing_lock(engine, "nightly_export"):
                break
        except Exception:  # noqa: BLE001, S110 — la tabla aún no existe
            pass
    process.terminate()
    output = process.communicate(timeout=60)[0]
    assert process.returncode != 0, output
    [run] = jr.list_runs(engine, "nightly_export")
    assert run.status == jr.FAILED, output
