"""Modelo del Gestor de Incidencias de Nexova y transformación CSV -> modelo.

Fuente de verdad: docs/CONTEXT-incident-manager-nexova.md
Sin dependencias externas: lo usan la API (Pydantic) y el seed.
"""
from datetime import datetime, timezone
from typing import Literal, get_args

Status = Literal["open", "in_progress", "resolved", "discarded"]
Origin = Literal["customer", "branch", "internal"]
Category = Literal[
    "technical_failure", "process_error", "client_complaint", "candidate_issue",
    "staff_issue", "sla_breach", "data_quality", "other",
]
Branch = Literal["central", "valencia_operations", "miami_office", "remote"]

# Valor en BD -> etiqueta para mostrar.
# El CONTEXT solo define nombres para mostrar de las sedes; para estados, orígenes
# y categorías la etiqueta es el propio valor (pendiente de confirmar con el mentor).
STATUSES: dict[str, str] = {value: value for value in get_args(Status)}
ORIGINS: dict[str, str] = {value: value for value in get_args(Origin)}
CATEGORIES: dict[str, str] = {value: value for value in get_args(Category)}
BRANCHES: dict[str, str] = {
    "central": "Central — Sede Valencia",
    "valencia_operations": "Valencia — Operaciones",
    "miami_office": "Miami Office",
    "remote": "Remoto (empleado sin sede fija)",
}

# resolved y discarded son estados finales
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "open": frozenset({"in_progress", "discarded"}),
    "in_progress": frozenset({"resolved", "discarded"}),
    "resolved": frozenset(),
    "discarded": frozenset(),
}

# Mapas CSV del analizador -> modelo del gestor
CSV_STATUS_MAP: dict[str, str] = {
    "OPEN": "open",
    "CLOSED": "resolved",
    "DISCARDED": "discarded",
}
CSV_CATEGORY_MAP: dict[str, str] = {
    "TECHNICAL": "technical_failure",
    "BILLING": "process_error",
    "ACCESS": "technical_failure",
    "HR_QUERY": "process_error",
    "COMPLAINT": "client_complaint",
}

TITLE_MAX_LENGTH = 120
SEED_ORIGIN = "customer"
SEED_BRANCH = "central"

# Clave interna -> etiqueta legible (nunca incluye datos del registro), como RULES
MAPPING_ERRORS = {
    "unmapped_status": "Status not mappable",
    "unmapped_category": "Category not mappable",
    "invalid_date": "Invalid or missing date",
    "empty_title": "Empty title",
}

# Si alguien cambia un Literal sin tocar su diccionario (o al revés), falla al importar
assert set(BRANCHES) == set(get_args(Branch))
assert set(ALLOWED_TRANSITIONS) == set(STATUSES)
assert set(CSV_STATUS_MAP.values()) <= set(STATUSES)
assert set(CSV_CATEGORY_MAP.values()) <= set(CATEGORIES)


def csv_row_to_incident(row: dict[str, str]) -> tuple[dict | None, list[str]]:
    """Transforma una fila del CSV en una incidencia lista para insertar (sin id).
    Devuelve (incidencia, []) o (None, claves de MAPPING_ERRORS).
    Nunca devuelve valores del registro en los errores."""
    def get(key: str) -> str:
        return (row.get(key) or "").strip()

    problems: list[str] = []

    status = CSV_STATUS_MAP.get(get("status"))
    if status is None:
        problems.append("unmapped_status")

    category = CSV_CATEGORY_MAP.get(get("category"))
    if category is None:
        problems.append("unmapped_category")

    try:
        day = datetime.strptime(get("date"), "%Y-%m-%d")
        created_at = day.replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        problems.append("invalid_date")

    description = row.get("description") or ""
    title = description[:TITLE_MAX_LENGTH].strip()
    if not title:
        problems.append("empty_title")

    if problems:
        return None, problems

    return {
        "title": title,
        "description": description,
        "status": status,
        "category": category,
        "origin": SEED_ORIGIN,
        "branch": SEED_BRANCH,
        "created_at": created_at,
        "updated_at": created_at,
    }, []
