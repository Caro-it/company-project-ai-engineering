"""Dead Letter Queue de la cola de tareas (DEV-55): tabla `task_dead_letters`.

Una tarea de Celery que agota sus reintentos (o falla sin poder reintentarse) no desaparece:
queda aquí con su `task_id`, el número de intentos, el error y cuándo falló. Se consulta en
`GET /tasks/dead-letters` (admin y manager).

`task_id` es único: registrar dos veces el mismo fallo (p. ej. una reentrega del mensaje) no
duplica la fila.
"""
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, DateTime, Integer, Text, Uuid, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, Session, SQLModel

from app import database

ArgsType = JSON().with_variant(JSONB(), "postgresql")


class TaskDeadLetter(SQLModel, table=True):
    __tablename__ = "task_dead_letters"

    id: UUID = Field(default_factory=uuid4, sa_column=Column(Uuid(as_uuid=True), primary_key=True))
    task_id: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    task_name: str = Field(sa_column=Column(Text, nullable=False))
    attempts: int = Field(sa_column=Column(Integer, nullable=False))
    error_message: str = Field(sa_column=Column(Text, nullable=False))
    # Solo ids y parámetros pequeños, como el mensaje de la cola: sirve para relanzarla a mano
    task_args: dict = Field(default_factory=dict, sa_column=Column(ArgsType, nullable=False))
    failed_at: datetime = Field(
        default_factory=lambda: datetime.now(UTC), sa_column=Column(DateTime(timezone=True), nullable=False)
    )


def record(task_id: str, task_name: str, attempts: int, error_message: str, task_args: dict[str, Any]) -> bool:
    """Registra el fallo definitivo. Devuelve False si ese task_id ya estaba."""
    TaskDeadLetter.__table__.create(database.engine, checkfirst=True)
    with Session(database.engine) as session:
        session.add(
            TaskDeadLetter(
                task_id=task_id,
                task_name=task_name,
                attempts=attempts,
                error_message=error_message[:4000],
                task_args=task_args,
            )
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return False
    return True


def get(task_id: str) -> TaskDeadLetter | None:
    with Session(database.engine) as session:
        return session.exec(select(TaskDeadLetter).where(TaskDeadLetter.task_id == task_id)).scalars().first()


def latest(limit: int = 50) -> list[TaskDeadLetter]:
    with Session(database.engine) as session:
        query = select(TaskDeadLetter).order_by(TaskDeadLetter.failed_at.desc()).limit(limit)
        return list(session.exec(query).scalars())
