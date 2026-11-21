"""Conexión y tablas del Pipeline de Desempeño de Negocio.

- Lee de `public.telemetry_events` (solo lectura) y escribe en el esquema `reporting`.
- No importa nada de services/api: la dependencia va siempre de services → data/pipelines.
- Credenciales: Prefect Secret block `nexova-supabase-database-url`; si no existe (local), la
  variable de entorno DATABASE_URL o, en su defecto, services/api/.env.
"""
import os
from functools import cache
from pathlib import Path

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    Engine,
    Integer,
    MetaData,
    Numeric,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    create_engine,
    event,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.pool import NullPool, StaticPool

REPO_ROOT = Path(__file__).resolve().parents[2]
SUPABASE_URL_BLOCK = "nexova-supabase-database-url"
ENVIRONMENT_BLOCK = "nexova-pipeline-environment"

metadata = MetaData()

# Fuente (definida aquí solo con las columnas que se leen; la tabla la crea services/api)
telemetry_events = Table(
    "telemetry_events",
    MetaData(),
    Column("timestamp", DateTime(timezone=True)),
    Column("event_type", Text),
    Column("tags", JSON().with_variant(JSONB(), "postgresql")),
)

# Destino: exactamente la tabla del BRIEFING (docs/CONTEXT-data-pipelines-nexova.md §5)
weekly_office_program_performance = Table(
    "weekly_office_program_performance",
    metadata,
    Column("id", Uuid(as_uuid=True), primary_key=True),
    Column("office", Text, nullable=False),
    Column("programme_id", Text, nullable=False),
    Column("week_start", Date, nullable=False),
    Column("total_material_cost", Numeric, nullable=False, server_default="0"),
    Column("kits_delivered_count", Integer, nullable=False, server_default="0"),
    Column("shortage_events_count", Integer, nullable=False, server_default="0"),
    Column("cost_variance_events_count", Integer, nullable=False, server_default="0"),
    Column("currency", Text, nullable=False),
    Column("computed_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    UniqueConstraint("office", "programme_id", "week_start", name="uq_weekly_office_program_week"),
    schema="reporting",
)

# Log de ejecución (PIPELINE_DESIGN.md §7)
pipeline_runs = Table(
    "pipeline_runs",
    metadata,
    Column("run_id", Uuid(as_uuid=True), primary_key=True),
    Column("pipeline", Text, nullable=False),
    Column("flow_run_id", Text),
    Column("trigger", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("started_at", DateTime(timezone=True), nullable=False),
    Column("finished_at", DateTime(timezone=True)),
    Column("window_start", Date, nullable=False),
    Column("window_end", Date, nullable=False),
    Column("environment", Text, nullable=False),
    Column("events_extracted", Integer),
    Column("events_discarded", Integer),
    Column("rows_upserted", Integer),
    Column("failed_phase", Text),
    Column("error_message", Text),
    schema="reporting",
)


def sqlite_reporting_path(url: str) -> str:
    """SQLite (tests y desarrollo sin Supabase) no tiene esquemas: `reporting` es otra base
    adjunta. En memoria si la principal está en memoria; si no, un archivo al lado
    (inventory.db → inventory.reporting.db)."""
    path = url.split("///", 1)[1] if "///" in url else ""
    if not path or path == ":memory:":
        return ":memory:"
    main = Path(path)
    return str(main.with_name(f"{main.stem}.reporting{main.suffix or '.db'}"))


def attach_reporting_schema(engine: Engine) -> None:
    """Adjunta `reporting` en cada conexión nueva de un engine SQLite."""
    reporting = sqlite_reporting_path(str(engine.url))

    @event.listens_for(engine, "connect")
    def _attach(dbapi_connection, _record):
        dbapi_connection.execute(f"ATTACH DATABASE '{reporting}' AS reporting")


def build_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
        attach_reporting_schema(engine)
        return engine
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgresql://")
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg2://" + url.removeprefix("postgres://")
    return create_engine(url, poolclass=NullPool)


def _from_block(name: str, kind: str) -> str | None:
    """Valor de un Prefect block, o None si Prefect no lo tiene (desarrollo local)."""
    try:
        if kind == "secret":
            from prefect.blocks.system import Secret

            return Secret.load(name).get()
        from prefect.blocks.system import String

        return String.load(name).value
    except Exception:  # noqa: BLE001 — block inexistente o sin servidor de Prefect
        return None


def database_url() -> str:
    url = os.environ.get("DATABASE_URL") or _from_block(SUPABASE_URL_BLOCK, "secret")
    if not url:
        from dotenv import dotenv_values

        url = dotenv_values(REPO_ROOT / "services" / "api" / ".env").get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            f"Falta la conexión a Supabase: crea el Prefect Secret block '{SUPABASE_URL_BLOCK}' "
            "o define DATABASE_URL (también vale la de services/api/.env)."
        )
    return url


def pipeline_environment() -> str:
    return os.environ.get("PIPELINE_ENVIRONMENT") or _from_block(ENVIRONMENT_BLOCK, "string") or "development"


_engine_override: Engine | None = None


def configure_engine(engine: Engine) -> None:
    """La API comparte su engine (misma DATABASE_URL); también lo usan los tests."""
    global _engine_override
    _engine_override = engine


@cache
def _default_engine() -> Engine:
    return build_engine(database_url())


def get_engine() -> Engine:
    return _engine_override or _default_engine()


def ensure_reporting_tables(engine: Engine) -> None:
    """Crea el esquema `reporting` y sus tablas si faltan (no borra nada)."""
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS reporting"))
            metadata.create_all(connection)
            connection.execute(
                text(
                    "ALTER TABLE reporting.weekly_office_program_performance "
                    "ALTER COLUMN id SET DEFAULT gen_random_uuid()"
                )
            )
    else:
        metadata.create_all(engine)
