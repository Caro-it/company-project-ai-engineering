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


class ProductCategory(StrEnum):
    """Categoría del material según el BRIEFING de telemetría (docs/CONTEXT-telemetry-nexova.md).

    Es independiente de AssetCategory (tipo de activo del Hito 5): un portátil es
    `hardware` como activo y `onboarding_equipment` como material.
    """

    TRAINING_KIT = "training_kit"
    CERTIFICATION = "certification"
    ONBOARDING_EQUIPMENT = "onboarding_equipment"


class RecipientType(StrEnum):
    """A quién se entrega una salida, como tipo. Nunca el nombre (eso es assigned_to)."""

    CLIENT = "client"
    CANDIDATE = "candidate"
    CONSULTANT = "consultant"
    SUPPORT_AGENT = "support_agent"
    EMPLOYEE = "employee"


class Currency(StrEnum):
    EUR = "EUR"
    USD = "USD"


# BRIEFING de telemetría §6: los montos van en la moneda de la oficina, sin convertir
OFFICE_CURRENCY: dict[Office, Currency] = {Office.VALENCIA: Currency.EUR, Office.MIAMI: Currency.USD}

# Umbral de stock mínimo por defecto: el mismo LOW_STOCK_MAX que ya usa el backoffice
DEFAULT_MIN_STOCK = 5

# programme_id: slug en minúsculas con guiones (ej. ventas-b2b)
PROGRAMME_ID_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"


def sql_in(enum: type[StrEnum]) -> str:
    """Lista SQL de valores para un CHECK: 'a', 'b', 'c'."""
    return ", ".join(f"'{member.value}'" for member in enum)
