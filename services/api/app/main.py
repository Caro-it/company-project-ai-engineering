from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_db_and_tables
from app.errors import register_error_handlers
from app.routers import auth, incidents, inventory, profiles, suppliers, users


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Al arrancar: crea en Supabase las tablas de inventario que falten
    # (SQLModel.metadata.create_all). TinyDB no necesita inicialización.
    create_db_and_tables()
    yield


app = FastAPI(title="Nexova API", version="0.1.0", lifespan=lifespan)
# Antes de CORSMiddleware: así el 500 de los errores no controlados pasa por CORS
register_error_handlers(app)

# El backoffice (Next.js) corre en localhost:3000 durante el desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profiles.router)
app.include_router(incidents.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
