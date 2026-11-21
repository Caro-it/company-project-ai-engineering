"""Tests unitarios de las transformaciones del Pipeline de Desempeño de Negocio (Hito 6, 3/3).

Sin base de datos ni APIs: eventos en memoria con la forma de telemetry_events
(timestamp, event_type, tags). Los valores esperados están calculados a mano a partir de las
definiciones de docs/CONTEXT-data-pipelines-nexova.md §2 y §4.

    uv run --project services/api python -m pytest tests/pipelines/test_pipeline.py
"""
import uuid
from datetime import date

import pandas as pd
import pytest
from pipelines import pipeline
from process.weekly_performance import (
    KPI_COLUMNS,
    clean_material_events,
    compute_weekly_office_program_kpis,
    flatten_material_events,
    iso_week_start,
)


def event(event_type: str, timestamp: str, event_id: str | None = None, **tags) -> dict:
    return {
        "timestamp": timestamp,
        "event_type": event_type,
        "tags": {**tags, "_envelope": {"event_id": event_id or str(uuid.uuid4()), "environment": "production"}},
    }


def frame(*events: dict) -> pd.DataFrame:
    return pd.DataFrame(list(events), columns=["timestamp", "event_type", "tags"])


VAL = {"office": "valencia", "programme_id": "ventas-b2b"}
MIA = {"office": "miami", "programme_id": "liderazgo-basico"}

# Semana del lunes 9/11/2026, en Valencia: 2 entradas, 3 entregas, 1 escasez, 1 subida de coste;
# en Miami: 1 entrada y 1 entrega
WEEK_EVENTS = frame(
    event("inbound_order_created", "2026-11-10T09:00:00Z", **VAL, quantity=10, unit_cost=12.5, total_cost=125.0),
    event("inbound_order_created", "2026-11-11T09:00:00Z", **VAL, quantity=4, unit_cost=15.0, total_cost=60.0),
    event("outbound_order_created", "2026-11-12T10:00:00Z", **VAL, quantity=5),
    event("outbound_order_created", "2026-11-12T11:00:00Z", **VAL, quantity=1),
    event("outbound_order_created", "2026-11-15T23:59:59Z", **VAL, quantity=2),
    event("stock_threshold_triggered", "2026-11-12T11:00:00Z", **VAL),
    event("kit_cost_variance_detected", "2026-11-11T09:00:00Z", **VAL, variance_pct=20.0),
    event("inbound_order_created", "2026-11-10T15:00:00Z", **MIA, quantity=3, unit_cost=100.0, total_cost=300.0),
    event("outbound_order_created", "2026-11-13T15:00:00Z", **MIA, quantity=1),
)


def kpis_by_office(kpis: pd.DataFrame) -> dict[str, dict]:
    return {row["office"]: row for row in kpis.to_dict(orient="records")}


# --- KPIs calculados a mano ---------------------------------------------------------------


def test_weekly_kpis_match_the_briefing_definitions():
    events, discarded = clean_material_events(flatten_material_events(WEEK_EVENTS))
    kpis = kpis_by_office(compute_weekly_office_program_kpis(events))

    assert discarded == 0
    assert kpis["valencia"] == {
        "office": "valencia",
        "programme_id": "ventas-b2b",
        "week_start": date(2026, 11, 9),
        "total_material_cost": 185.0,  # Costo de material: 10 × 12,50 + 4 × 15,00
        "kits_delivered_count": 3,  # Kits entregados: 3 outbound_order_created
        "shortage_events_count": 1,  # Frecuencia de escasez
        "cost_variance_events_count": 1,  # Frecuencia de variación de costo
        "currency": "EUR",
    }


def test_currencies_are_never_mixed():
    events, _ = clean_material_events(flatten_material_events(WEEK_EVENTS))
    kpis = kpis_by_office(compute_weekly_office_program_kpis(events))
    assert kpis["miami"]["total_material_cost"] == 300.0
    assert kpis["miami"]["currency"] == "USD"
    assert kpis["valencia"]["currency"] == "EUR"  # 185 EUR y 300 USD en filas separadas, sin sumar


def test_events_are_grouped_by_iso_week_in_utc():
    sunday_night = pd.Series(["2026-11-15T23:59:59Z", "2026-11-16T00:00:00Z", "2026-11-16T00:30:00+01:00"])
    # domingo 23:59:59 → semana del 9; lunes 00:00 → semana del 16; lunes 00:30 en Madrid es
    # domingo 23:30 UTC → semana del 9
    assert list(iso_week_start(sunday_night)) == [date(2026, 11, 9), date(2026, 11, 16), date(2026, 11, 9)]


def test_kpis_are_split_by_programme_and_week():
    events, _ = clean_material_events(
        flatten_material_events(
            frame(
                event("outbound_order_created", "2026-11-10T09:00:00Z", **VAL),
                event("outbound_order_created", "2026-11-17T09:00:00Z", **VAL),
                event("outbound_order_created", "2026-11-10T09:00:00Z", office="valencia", programme_id="onboarding-soporte"),
            )
        )
    )
    kpis = compute_weekly_office_program_kpis(events)
    assert list(zip(kpis["programme_id"], kpis["week_start"], kpis["kits_delivered_count"], strict=True)) == [
        ("onboarding-soporte", date(2026, 11, 9), 1),
        ("ventas-b2b", date(2026, 11, 9), 1),
        ("ventas-b2b", date(2026, 11, 16), 1),
    ]


def test_prefect_transformation_task_returns_kpis_and_discards():
    """La task de Prefect (su función, sin servidor) envuelve la misma transformación."""
    kpis, discarded = pipeline.compute_weekly_office_program_kpis_task.fn(WEEK_EVENTS)
    assert discarded == 0
    assert list(kpis.columns) == KPI_COLUMNS
    assert kpis["total_material_cost"].sum() == 485.0


# --- Comportamiento defensivo ------------------------------------------------------------------


def test_invalid_events_are_discarded_without_breaking_the_batch():
    duplicated_id = str(uuid.uuid4())
    raw = frame(
        event("outbound_order_created", "2026-11-10T09:00:00Z", **VAL),
        event("outbound_order_created", "2026-11-10T09:00:00Z", office="valencia", programme_id=None),  # sin programa
        event("outbound_order_created", "2026-11-10T09:00:00Z", office="madrid", programme_id="x"),  # oficina desconocida
        event("inbound_order_created", "2026-11-10T09:00:00Z", **VAL, total_cost="doce"),  # coste no numérico
        event("inbound_order_created", "2026-11-10T09:00:00Z", **VAL, total_cost=-5),  # coste negativo
        event("outbound_order_created", "no es una fecha", **VAL),
        event("page_viewed", "2026-11-10T09:00:00Z", **VAL),  # fuera de los 4 del BRIEFING
        event("outbound_order_created", "2026-11-10T09:00:00Z", duplicated_id, **VAL),
        event("outbound_order_created", "2026-11-10T09:05:00Z", duplicated_id, **VAL),  # mismo event_id
        {"timestamp": "2026-11-10T09:00:00Z", "event_type": "outbound_order_created", "tags": None},  # tags nulos
    )
    events, discarded = clean_material_events(flatten_material_events(raw))
    assert len(events) == 2  # la primera y la primera del event_id repetido
    assert discarded == 8
    assert compute_weekly_office_program_kpis(events)["kits_delivered_count"].tolist() == [2]


def test_office_and_programme_are_normalized():
    raw = frame(event("outbound_order_created", "2026-11-10T09:00:00Z", office=" Valencia ", programme_id=" ventas-b2b "))
    events, discarded = clean_material_events(flatten_material_events(raw))
    assert discarded == 0
    assert compute_weekly_office_program_kpis(events)[["office", "programme_id"]].values.tolist() == [
        ["valencia", "ventas-b2b"]
    ]


def test_empty_input_gives_empty_kpis():
    events, discarded = clean_material_events(flatten_material_events(frame()))
    assert discarded == 0
    kpis = compute_weekly_office_program_kpis(events)
    assert kpis.empty and list(kpis.columns) == KPI_COLUMNS


@pytest.mark.parametrize("missing", ["timestamp", "event_type"])
def test_missing_required_column_fails_loudly(missing):
    """Una entrada sin columnas básicas es un error de la extracción, no datos que descartar."""
    with pytest.raises(KeyError):
        flatten_material_events(WEEK_EVENTS.drop(columns=[missing]))
