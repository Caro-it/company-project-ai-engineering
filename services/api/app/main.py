import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.cache import ALL_CACHES
from app.config import settings
from app.database import create_db_and_tables
from app.deps import get_current_user
from app.errors import register_error_handlers
from app.routers import auth, incidents, inventory, profiles, suppliers, users


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Al arrancar: crea en Supabase las tablas de inventario que falten
    # (SQLModel.metadata.create_all). TinyDB no necesita inicialización.
    create_db_and_tables()
    yield


app = FastAPI(title="Nexova API", version="0.1.0", lifespan=lifespan)

# --- Timing (proyecto Caching) -----------------------------------------------------------
# Una línea de log por petición con su duración: así se eligieron los endpoints a cachear
# (ver CACHING_REPORT.md). Solo método, ruta, status y ms: nunca query params ni cuerpo.
timing_logger = logging.getLogger("api.timing")
if not timing_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(message)s"))
    timing_logger.addHandler(_handler)
    timing_logger.setLevel(logging.INFO)
    timing_logger.propagate = False


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start) * 1000  # ms
    response.headers["X-Response-Time-ms"] = f"{duration:.1f}"
    timing_logger.info(
        "%s %s → %s | %.1fms", request.method, request.url.path, response.status_code, duration
    )
    return response

# Antes de CORSMiddleware: así el 500 de los errores no controlados pasa por CORS
register_error_handlers(app)

# El backoffice (Next.js) corre en localhost:3000 durante el desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Response-Time-ms"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profiles.router)
app.include_router(incidents.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)


class HealthOut(BaseModel):
    status: Literal["ok"]


@app.get("/api/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(status="ok")


class CacheStatsOut(BaseModel):
    name: str
    ttl_seconds: float
    entries: int
    hits: int
    misses: int


# Evidencia para CACHING_REPORT.md: aciertos/fallos de cada caché. Con token, como el resto
@app.get(
    "/api/cache/stats",
    response_model=list[CacheStatsOut],
    dependencies=[Depends(get_current_user)],
)
def cache_stats() -> list[CacheStatsOut]:
    return [CacheStatsOut(**cache.stats()) for cache in ALL_CACHES]
