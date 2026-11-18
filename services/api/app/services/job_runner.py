"""Control de estado de los procesos en segundo plano (tabla `job_runs`).

Cada ejecución de un job es una fila con la máquina de estados:

    pending → processing → completed
                         ↘ failed

- El **lock distribuido es el propio estado `processing`**: un índice único parcial
  (`job_name` WHERE status = 'processing') impide que dos filas del mismo job estén en
  `processing` a la vez. Si dos instancias arrancan al mismo tiempo, la base de datos solo
  deja pasar a una (no hay tabla ni columna de lock aparte).
- La **idempotencia es por día**: `has_completed_for_date(job_name, target_date)`.
- `job_runs` ≠ `reporting.pipeline_runs`: aquí se registra la orquestación (export CSV,
  lanzar el pipeline, lock); el pipeline registra sus propias fases en `pipeline_runs`.

Este módulo no importa nada de FastAPI: lo usa `scripts/nightly_export.py`, que corre como
proceso independiente de la API.
"""
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Index,
    Text,
    Uuid,
    inspect,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlmodel import Field, Session, SQLModel, select

PENDING = "pending"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"
STATUSES = (PENDING, PROCESSING, COMPLETED, FAILED)

# Una fila en `processing` más antigua que esto se considera huérfana (proceso matado con
# SIGKILL, apagón…): la siguiente ejecución la pasa a `failed` para no bloquear el job
# para siempre. Un `try/except/finally` no puede cubrir un proceso que muere de golpe.
DEFAULT_STALE_AFTER = timedelta(hours=6)

_PROCESSING_ONLY = text("status = 'processing'")


def _now() -> datetime:
    return datetime.now(UTC)


class JobRun(SQLModel, table=True):
    __tablename__ = "job_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')", name="ck_job_runs_status"
        ),
        # Consultas de idempotencia: ¿ya hay un `completed` para este job y este día?
        Index("ix_job_runs_job_name_target_date", "job_name", "target_date"),
        # El lock: como mucho una fila `processing` por job
        Index(
            "uq_job_runs_one_processing_per_job",
            "job_name",
            unique=True,
            postgresql_where=_PROCESSING_ONLY,
            sqlite_where=_PROCESSING_ONLY,
        ),
    )

    id: UUID = Field(default_factory=uuid4, sa_column=Column(Uuid(as_uuid=True), primary_key=True))
    job_name: str = Field(sa_column=Column(Text, nullable=False))
    target_date: date = Field(sa_column=Column(Date, nullable=False))
    status: str = Field(default=PENDING, sa_column=Column(Text, nullable=False, server_default=PENDING))
    started_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    finished_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(
        default_factory=_now, sa_column=Column(DateTime(timezone=True), nullable=False)
    )


# Lo mismo en SQL, para crear la tabla a mano en Supabase (SQL Editor) si se prefiere.
# `uv run migrate-job-runs` hace exactamente esto desde el modelo.
JOB_RUNS_SQL = """
CREATE TABLE IF NOT EXISTS job_runs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name      text NOT NULL,
    target_date   date NOT NULL,
    status        text NOT NULL DEFAULT 'pending'
                  CONSTRAINT ck_job_runs_status
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    started_at    timestamptz,
    finished_at   timestamptz,
    error_message text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_job_runs_job_name_target_date ON job_runs (job_name, target_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_runs_one_processing_per_job
    ON job_runs (job_name) WHERE status = 'processing';
"""


class LockHeldError(Exception):
    """Otra instancia del mismo job está en `processing`."""


def ensure_job_runs_table(engine: Engine) -> None:
    """Crea `job_runs` y sus índices si faltan (no borra nada).

    En PostgreSQL usa `JOB_RUNS_SQL` (con los defaults de servidor). Si dos procesos la crean
    a la vez, el que pierde la carrera recibe un error de "ya existe": se ignora si la tabla
    ya está.
    """
    try:
        if engine.dialect.name == "postgresql":
            with engine.begin() as connection:
                for statement in filter(str.strip, JOB_RUNS_SQL.split(";")):
                    connection.execute(text(statement))
        else:
            JobRun.__table__.create(engine, checkfirst=True)
    except DBAPIError:
        if not inspect(engine).has_table(JobRun.__tablename__):
            raise


@contextmanager
def _session(engine: Engine) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as session:
        yield session


def get_run(engine: Engine, run_id: UUID) -> JobRun | None:
    with _session(engine) as session:
        return session.get(JobRun, run_id)


def list_runs(engine: Engine, job_name: str, target_date: date | None = None) -> list[JobRun]:
    with _session(engine) as session:
        query = select(JobRun).where(JobRun.job_name == job_name)
        if target_date is not None:
            query = query.where(JobRun.target_date == target_date)
        return list(session.exec(query.order_by(JobRun.created_at)))


def has_processing_lock(engine: Engine, job_name: str) -> bool:
    """¿Hay una ejecución de este job en curso?"""
    with _session(engine) as session:
        query = select(JobRun.id).where(JobRun.job_name == job_name, JobRun.status == PROCESSING)
        return session.exec(query.limit(1)).first() is not None


def has_completed_for_date(engine: Engine, job_name: str, target_date: date) -> bool:
    """¿Este job ya terminó bien para este día? (idempotencia por `target_date`)"""
    with _session(engine) as session:
        query = select(JobRun.id).where(
            JobRun.job_name == job_name,
            JobRun.target_date == target_date,
            JobRun.status == COMPLETED,
        )
        return session.exec(query.limit(1)).first() is not None


def create_run(engine: Engine, job_name: str, target_date: date) -> UUID:
    """Registra la ejecución en `pending`, antes de empezar ningún trabajo."""
    run = JobRun(job_name=job_name, target_date=target_date, status=PENDING)
    with _session(engine) as session:
        session.add(run)
        session.commit()
        return run.id


def _update(engine: Engine, run_id: UUID, **values: Any) -> JobRun:
    with _session(engine) as session:
        run = session.get(JobRun, run_id)
        if run is None:
            raise LookupError(f"job_runs: no existe la ejecución {run_id}")
        for key, value in values.items():
            setattr(run, key, value)
        session.add(run)
        session.commit()
        return run


def mark_processing(engine: Engine, run_id: UUID) -> JobRun:
    """`pending` → `processing`. Es la toma del lock: si otra fila del mismo job ya está en
    `processing`, el índice único parcial lo rechaza y se lanza `LockHeldError`."""
    try:
        return _update(engine, run_id, status=PROCESSING, started_at=_now())
    except IntegrityError as exc:
        raise LockHeldError("otra ejecución del job está en processing") from exc


def mark_completed(engine: Engine, run_id: UUID) -> JobRun:
    return _update(engine, run_id, status=COMPLETED, finished_at=_now(), error_message=None)


def mark_failed(engine: Engine, run_id: UUID, error_message: str) -> JobRun:
    return _update(engine, run_id, status=FAILED, finished_at=_now(), error_message=error_message[:4000])


def discard_pending(engine: Engine, run_id: UUID) -> None:
    """Borra una fila que nunca llegó a `processing` (la instancia que perdió la carrera
    por el lock): así la cancelación no deja ninguna fila `pending` colgada."""
    with _session(engine) as session:
        run = session.get(JobRun, run_id)
        if run is not None and run.status == PENDING:
            session.delete(run)
            session.commit()


def fail_stale_runs(
    engine: Engine, job_name: str, stale_after: timedelta = DEFAULT_STALE_AFTER, now: datetime | None = None
) -> list[UUID]:
    """Pasa a `failed` las filas `processing` (o `pending`) huérfanas de este job, más
    antiguas que `stale_after`. Devuelve sus ids."""
    limit = (now or _now()) - stale_after
    with _session(engine) as session:
        query = select(JobRun).where(JobRun.job_name == job_name, JobRun.status.in_([PENDING, PROCESSING]))
        stale = [
            run for run in session.exec(query)
            if _aware(run.started_at or run.created_at) < limit
        ]
        for run in stale:
            run.error_message = (
                f"Ejecución huérfana: seguía en {run.status} más de {stale_after}; "
                "el proceso murió sin poder cerrar el registro"
            )
            run.status = FAILED
            run.finished_at = _now()
            session.add(run)
        session.commit()
        return [run.id for run in stale]


def _aware(value: datetime) -> datetime:
    """SQLite devuelve las fechas sin zona horaria: se guardan siempre en UTC."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)
