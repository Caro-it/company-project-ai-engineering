"""Valores permitidos del inventario de Nexova.

Fuente de verdad: docs/CONTEXT-inventory-nexova.md (BRIEFING del Hito 5, ticket NXV-0201).
Los usan tanto los modelos ORM (restricciones CHECK en Supabase) como los schemas Pydantic.
"""
from enum import StrEnum


class AssetCategory(StrEnum):
    HARDWARE = "hardware"
    PERIPHERALS = "peripherals"
    OFFICE_SUPPLIES = "office_supplies"
    TRAINING_MATERIALS = "training_materials"


class Office(StrEnum):
    VALENCIA = "Valencia"
    MIAMI = "Miami"


class ExitType(StrEnum):
    ALLOCATION = "allocation"  # asignado a un empleado: assigned_to obligatorio
    CONSUMPTION = "consumption"  # consumido (p. ej. papel): assigned_to nulo


def sql_in(enum: type[StrEnum]) -> str:
    """Lista SQL de valores para un CHECK: 'a', 'b', 'c'."""
    return ", ".join(f"'{member.value}'" for member in enum)
