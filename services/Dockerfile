# Imagen de desarrollo de la API centralizada (services/api, FastAPI + uvicorn).
#
# Contexto de build: ./services. requirements.txt instala en modo editable
# "-e ../../packages/shared/incidents_core", una ruta fuera de ./services:
# docker-compose.yml pasa packages/shared como contexto adicional "shared" y
# aquí se reproduce la estructura del monorepo (/app/services/api y
# /app/packages/shared) para que la ruta relativa siga cuadrando.
#
# Python 3.12: la versión del .venv local (pyproject exige >=3.11).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

WORKDIR /app/services/api

COPY --from=shared incidents_core /app/packages/shared/incidents_core

# Dependencias de terceros primero (sin las dos líneas "-e"), para que la capa
# se reutilice mientras requirements.txt no cambie.
COPY api/requirements.txt ./
RUN grep -v '^-e ' requirements.txt > /tmp/requirements-deps.txt \
    && uv pip install --system --no-cache -r /tmp/requirements-deps.txt

# Código de la API y requirements.txt completo (añade -e . y -e incidents_core)
COPY api/ ./
RUN uv pip install --system --no-cache -r requirements.txt

EXPOSE 8000

# Secretos y configuración llegan por env_file (.env de la raíz), nunca aquí
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
