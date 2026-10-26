"""Modelos Pydantic del Gestor de Incidencias de Nexova.

Fuente de verdad: docs/CONTEXT-incident-manager-nexova.md
Los valores permitidos salen de incidents_core.incident_model (compartido con el seed).
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from incidents_core.incident_model import Branch, Category, Origin, Status


class IncidentBase(BaseModel):
    title: str
    description: str
    category: Category
    origin: Origin
    branch: Branch

    @field_validator("title", "description")
    @classmethod
    def not_blank(cls, value: str) -> str:
        # Se rechaza sin modificar el texto: la descripción del seed se guarda literal
        if not value.strip():
            raise ValueError("No puede estar vacío")
        return value


class IncidentCreate(IncidentBase):
    """Entrada de POST /incidents. El cliente NO envía id, status ni fechas:
    toda incidencia nueva empieza en open."""
    model_config = ConfigDict(extra="forbid")


class Incident(IncidentBase):
    """Respuesta de la API: incluye los campos generados por el sistema."""
    id: str
    status: Status
    created_at: datetime
    updated_at: datetime
