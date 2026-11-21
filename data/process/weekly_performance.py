"""Transformaciones del Pipeline de Desempeño de Negocio (Hito 6).

Funciones puras de Pandas: no tocan la base de datos ni Prefect, así se prueban con datos en
memoria (tests/pipelines/test_pipeline.py). Fuente de verdad de los KPIs:
docs/CONTEXT-data-pipelines-nexova.md §2 y §4.

Grano del resultado: una fila por office × programme_id × week_start (lunes ISO, UTC).
"""
import pandas as pd

INBOUND = "inbound_order_created"
OUTBOUND = "outbound_order_created"
SHORTAGE = "stock_threshold_triggered"
COST_VARIANCE = "kit_cost_variance_detected"
KPI_EVENT_TYPES = (INBOUND, OUTBOUND, SHORTAGE, COST_VARIANCE)

# BRIEFING §7: cada oficina reporta en su moneda; nunca se convierte ni se suma entre monedas
OFFICE_CURRENCY = {"valencia": "EUR", "miami": "USD"}

KPI_COLUMNS = [
    "office",
    "programme_id",
    "week_start",
    "total_material_cost",
    "kits_delivered_count",
    "shortage_events_count",
    "cost_variance_events_count",
    "currency",
]

EVENT_COLUMNS = ["event_id", "timestamp", "event_type", "office", "programme_id", "total_cost"]


def flatten_material_events(raw: pd.DataFrame) -> pd.DataFrame:
    """Filas de telemetry_events (timestamp, event_type, tags) → columnas planas.

    Extrae de `tags` las dimensiones del BRIEFING y el event_id del envelope.
    """
    if raw.empty:
        return pd.DataFrame(columns=EVENT_COLUMNS)
    # tags que no sean un objeto (nulo, texto…) cuentan como vacíos: la fila se descartará después
    tags_objects = [value if isinstance(value, dict) else {} for value in raw["tags"]]
    tags = pd.json_normalize(tags_objects).reindex(
        columns=["_envelope.event_id", "office", "programme_id", "total_cost"]
    )
    tags.index = raw.index
    flat = pd.concat([raw[["timestamp", "event_type"]], tags], axis=1)
    return flat.rename(columns={"_envelope.event_id": "event_id"})[EVENT_COLUMNS]


def clean_material_events(events: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Valida y deduplica. Devuelve (eventos válidos, nº descartados).

    Se descarta (sin romper el lote): event_type fuera de los 4 del BRIEFING, oficina que no
    es valencia/miami, programme_id vacío, timestamp ilegible, un inbound sin coste numérico
    >= 0, y cualquier repetición del mismo event_id.
    """
    if events.empty:
        return pd.DataFrame(columns=EVENT_COLUMNS), 0
    df = events.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df["office"] = df["office"].astype("string").str.strip().str.lower()
    df["programme_id"] = df["programme_id"].astype("string").str.strip()
    df["total_cost"] = pd.to_numeric(df["total_cost"], errors="coerce")

    valid = (
        df["event_type"].isin(KPI_EVENT_TYPES)
        & df["office"].isin(list(OFFICE_CURRENCY))
        & df["programme_id"].fillna("").ne("")
        & df["timestamp"].notna()
        & df["event_id"].notna()
        & (df["event_type"].ne(INBOUND) | df["total_cost"].ge(0))
    )
    cleaned = df[valid].drop_duplicates(subset="event_id", keep="first")
    return cleaned.reset_index(drop=True), len(events) - len(cleaned)


def iso_week_start(timestamps: pd.Series) -> pd.Series:
    """Lunes (fecha) de la semana ISO de cada timestamp, en UTC."""
    ts = pd.to_datetime(timestamps, utc=True)
    return (ts.dt.normalize() - pd.to_timedelta(ts.dt.day_of_week, unit="D")).dt.date


def compute_weekly_office_program_kpis(events: pd.DataFrame) -> pd.DataFrame:
    """Los 4 KPIs del BRIEFING por office × programme_id × week_start.

    - total_material_cost: suma de total_cost de inbound_order_created (moneda de la oficina)
    - kits_delivered_count: nº de outbound_order_created
    - shortage_events_count: nº de stock_threshold_triggered
    - cost_variance_events_count: nº de kit_cost_variance_detected
    Espera eventos ya limpios (clean_material_events).
    """
    if events.empty:
        return pd.DataFrame(columns=KPI_COLUMNS)
    df = events.copy()
    df["week_start"] = iso_week_start(df["timestamp"])
    df["inbound_cost"] = df["total_cost"].where(df["event_type"].eq(INBOUND), 0.0).fillna(0.0)
    df["is_outbound"] = df["event_type"].eq(OUTBOUND)
    df["is_shortage"] = df["event_type"].eq(SHORTAGE)
    df["is_cost_variance"] = df["event_type"].eq(COST_VARIANCE)

    kpis = (
        df.groupby(["office", "programme_id", "week_start"])
        .agg(
            total_material_cost=("inbound_cost", "sum"),
            kits_delivered_count=("is_outbound", "sum"),
            shortage_events_count=("is_shortage", "sum"),
            cost_variance_events_count=("is_cost_variance", "sum"),
        )
        .reset_index()
    )
    kpis["total_material_cost"] = kpis["total_material_cost"].astype(float).round(2)
    count_columns = ["kits_delivered_count", "shortage_events_count", "cost_variance_events_count"]
    kpis[count_columns] = kpis[count_columns].astype(int)
    kpis["office"] = kpis["office"].astype(str)
    kpis["programme_id"] = kpis["programme_id"].astype(str)
    kpis["currency"] = kpis["office"].map(OFFICE_CURRENCY)
    return kpis[KPI_COLUMNS].sort_values(["week_start", "office", "programme_id"]).reset_index(drop=True)
