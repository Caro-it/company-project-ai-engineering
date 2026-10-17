from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import incidents

app = FastAPI(title="Nexova API", version="0.1.0")

# El backoffice (Next.js) corre en localhost:3000 durante el desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(incidents.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}