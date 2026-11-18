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


class IncidentStatusUpdate(BaseModel):
    """Entrada de PATCH /incidents/{id}/status. La transición la valida el servicio."""
    model_config = ConfigDict(extra="forbid")
    status: Status


class Incident(IncidentBase):
    """Detalle (POST, GET /{id}, PATCH /{id}/status): incluye los campos del sistema."""
    id: str
    status: Status
    created_at: datetime
    updated_at: datetime


class IncidentListItem(BaseModel):
    """Fila de GET /api/incidents: lo que pinta el listado del backoffice (título,
    descripción, etiquetas, fecha de alta y estado). Sin updated_at, que solo usa el detalle."""
    id: str
    title: str
    description: str
    category: Category
    origin: Origin
    branch: Branch
    status: Status
    created_at: datetime


class IncidentStats(BaseModel):
    """Respuesta de GET /api/incidents/summary. Cada desglose trae siempre todas las claves
    de su catálogo, aunque valgan 0."""
    total: int
    by_status: dict[Status, int]
    by_category: dict[Category, int]
    by_origin: dict[Origin, int]
    by_branch: dict[Branch, int]


# --- Analizador de CSV (POST /api/incidents/analyze) ---
# Las claves de los desgloses son las de incidents_core.constants (RULES, VALID_CATEGORIES,
# VALID_STATUSES) y las puntuaciones 1-5: se tipan como dict porque el catálogo vive ahí.


class SatisfactionStats(BaseModel):
    closed: int
    scored: int
    average: float
    distribution: dict[int, int]


class AnalysisSummary(BaseModel):
    total_records: int
    valid_records: int
    invalid_records: int
    invalid_by_rule: dict[str, int]
    by_category: dict[str, int]
    by_status: dict[str, int]
    satisfaction: SatisfactionStats


class AnalyzeOut(BaseModel):
    filename: str
    summary: AnalysisSummary
    invalid_rule_labels: dict[str, str]
