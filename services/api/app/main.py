from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.errors import register_error_handlers
from app.routers import auth, incidents, profiles, suppliers, users

app = FastAPI(title="Nexova API", version="0.1.0")
# Antes de CORSMiddleware: así el 500 de los errores no controlados pasa por CORS
register_error_handlers(app)

# El backoffice (Next.js) corre en localhost:3000 durante el desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profiles.router)
app.include_router(incidents.router)
app.include_router(suppliers.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
