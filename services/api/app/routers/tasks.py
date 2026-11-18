"""Estado de las tareas encoladas (DEV-55).

- `GET /tasks/{task_id}`: estado real de Celery (`pending`, `started`, `retry`, `success`,
  `failure`), el resultado cuando lo hay, los reintentos y, si acabó en la DLQ, su registro.
- `GET /tasks/dead-letters`: últimas tareas en la Dead Letter Queue (admin y manager).

Celery no distingue un `task_id` que no existe de una tarea que aún espera en la cola: los
dos se ven `pending`.
"""
from datetime import datetime
from typing import Any

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth_models import Role
from app.celery_app import celery_app
from app.deps import get_current_user
from app.services import task_dead_letters

router = APIRouter(prefix="/tasks", tags=["tasks"], dependencies=[Depends(get_current_user)])


class DeadLetter(BaseModel):
    task_id: str
    task_name: str
    attempts: int
    error_message: str
    task_args: dict[str, Any]
    failed_at: datetime


class TaskStatus(BaseModel):
    task_id: str
    status: str
    task_name: str | None = None
    result: Any = None
    error: str | None = None
    retries: int = 0
    dead_letter: DeadLetter | None = None


def _dead_letter(row) -> DeadLetter | None:
    return DeadLetter.model_validate(row, from_attributes=True) if row else None


@router.get("/dead-letters", response_model=list[DeadLetter])
def dead_letters(limit: int = 50, current_user: dict = Depends(get_current_user)) -> list[DeadLetter]:
    if current_user["role"] not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status_code=403, detail="Solo admin o manager pueden ver la cola de fallidos")
    return [_dead_letter(row) for row in task_dead_letters.latest(min(max(limit, 1), 200))]


@router.get("/{task_id}", response_model=TaskStatus)
def task_status(task_id: str) -> TaskStatus:
    result = AsyncResult(task_id, app=celery_app)
    state = result.state.lower()  # PENDING, STARTED, RETRY, SUCCESS, FAILURE
    body = TaskStatus(task_id=task_id, status=state, task_name=result.name, retries=result.retries or 0)
    if state == "success":
        body.result = result.result
    elif state in ("failure", "retry"):
        body.error = f"{type(result.result).__name__}: {result.result}" if result.result else None
    if state == "failure":
        body.dead_letter = _dead_letter(task_dead_letters.get(task_id))
    return body
