from collections.abc import AsyncIterator
from uuid import UUID, uuid4
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_db_and_tables
from app.errors import register_error_handlers
from app.routers import auth, incidents, inventory, profiles, suppliers, telemetry, users


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Al arrancar: crea en Supabase las tablas de inventario que falten
    # (SQLModel.metadata.create_all). TinyDB no necesita inicialización.
    create_db_and_tables()
    yield


app = FastAPI(title="Nexova API", version="0.1.0", lifespan=lifespan)
# Antes de CORSMiddleware: así el 500 de los errores no controlados pasa por CORS
register_error_handlers(app)



# Correlación de telemetría (requestId del envelope): el backoffice manda un UUID por
# petición en X-Request-ID; si falta o no es un UUID, se genera aquí. Se devuelve en la
# respuesta para que frontend, API y logs compartan el mismo id.
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID", "")
    try:
        request_id = str(UUID(incoming))
    except ValueError:
        request_id = str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# El backoffice (Next.js) corre en localhost:3000 durante el desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profiles.router)
app.include_router(incidents.router)
app.include_router(suppliers.router)
app.include_router(inventory.router)
app.include_router(telemetry.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
