"""Modelos Pydantic del Directorio de Proveedores de Nexova.

Fuente de verdad: docs/CONTEXT-suppliers-nexova.md
"""
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Country(StrEnum):
    SPAIN = "Spain"
    USA = "USA"


class Currency(StrEnum):
    EUR = "EUR"
    USD = "USD"


class Category(StrEnum):
    JOB_BOARDS = "job_boards"
    ATS_SOFTWARE = "ats_software"
    ASSESSMENT_TOOLS = "assessment_tools"
    TRAINING_PLATFORMS = "training_platforms"
    PAYROLL_AND_HR_SOFTWARE = "payroll_and_hr_software"
    VIDEO_INTERVIEW = "video_interview"
    BACKGROUND_CHECK = "background_check"
    OFFICE_AND_FACILITIES = "office_and_facilities"
    IT_AND_SOFTWARE_LICENSES = "it_and_software_licenses"


class Status(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


# Restricción de negocio: moneda según país del contrato
CURRENCY_BY_COUNTRY = {
    Country.SPAIN: Currency.EUR,
    Country.USA: Currency.USD,
}


class SupplierBase(BaseModel):
    name: str = Field(min_length=1)
    country: Country
    categories: list[Category] = Field(min_length=1)
    monthly_rate: float = Field(gt=0)
    currency: Currency
    status: Status
    contract_renewal_date: date | None = None
    contact_email: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def currency_matches_country(self):
        expected = CURRENCY_BY_COUNTRY[self.country]
        if self.currency != expected:
            raise ValueError(
                f"Un proveedor de {self.country} debe usar {expected}, no {self.currency}"
            )
        return self


class SupplierCreate(SupplierBase):
    """Entrada de POST /suppliers. El cliente NO envia id ni updated_at."""
    model_config = ConfigDict(extra="forbid")


class Supplier(SupplierBase):
    """Respuesta de la API: incluye los campos generados por el sistema."""
    id: int
    updated_at: datetime


class RateUpdate(BaseModel):
    """Entrada de PATCH /suppliers/{id}/rate."""
    model_config = ConfigDict(extra="forbid")
    monthly_rate: float = Field(gt=0)


class StatusUpdate(BaseModel):
    """Entrada de PATCH /suppliers/{id}/status."""
    model_config = ConfigDict(extra="forbid")
    status: Status