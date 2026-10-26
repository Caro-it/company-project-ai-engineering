"""Manejadores de error globales de la API.

- Validación: en las rutas del Gestor de Incidencias → 400 con errores por campo y
  mensajes en español. En el resto (auth, users, profiles, suppliers, analyze) se
  mantiene el 422 por defecto de FastAPI, del que depende el frontend de AUTH-02.
- Errores propios del gestor (ApiError: 404, transición inválida) → JSON con "code".
- Excepciones no controladas → 500 con mensaje genérico, sin traceback. Las captura
  un middleware que queda por dentro de CORSMiddleware, para que el 500 lleve las
  cabeceras CORS y el frontend pueda leerlo.

Soporte bilingüe: cada error lleva un "code" estable en inglés para que el frontend
traduzca; "message"/"detail" en español queda como respaldo.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from incidents_core.incident_model import BRANCHES, CATEGORIES, ORIGINS, STATUSES

# Logger que uvicorn ya configura: el traceback sale en la consola del servidor
logger = logging.getLogger("uvicorn.error")

INTERNAL_ERROR = {"detail": "Error interno del servidor", "code": "internal_error"}

INCIDENTS_PREFIX = "/api/incidents"
# Rutas del analizador bajo el mismo prefijo: conservan su 422
ANALYZER_PATHS = {"/api/incidents/analyze", "/api/incidents/results/export"}

# Campo -> (nombre para el mensaje, terminación de género)
FIELD_NAMES = {
    "title": ("El título", "o"),
    "description": ("La descripción", "a"),
    "category": ("La categoría", "a"),
    "origin": ("El origen", "o"),
    "branch": ("La sede", "a"),
    "status": ("El estado", "o"),
}
ALLOWED_VALUES = {
    "status": STATUSES,
    "category": CATEGORIES,
    "origin": ORIGINS,
    "branch": BRANCHES,
}


class ApiError(Exception):
    """Error de negocio con código estable. Respuesta: {"detail", "code", **extra}."""

    def __init__(self, status_code: int, code: str, message: str, **extra):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.extra = extra


def _is_incident_manager_path(path: str) -> bool:
    return path.startswith(INCIDENTS_PREFIX) and path not in ANALYZER_PATHS


def _field(loc: tuple) -> str:
    """("body", "title") → "title"; ("query", "status") → "status"; ("body",) → "body"."""
    if len(loc) > 1 and isinstance(loc[1], str):
        return loc[1]
    return "body"


def _describe(field: str, error_type: str) -> dict:
    """{"code", "message"} (y "allowed" en invalid_choice) para un error de Pydantic.
    Nunca repite el valor enviado."""
    if field == "body":
        if error_type == "missing":
            return {"code": "missing_body", "message": "Falta el cuerpo de la petición"}
        if error_type == "json_invalid":
            return {"code": "invalid_json", "message": "El cuerpo de la petición no es un JSON válido"}
        return {"code": "invalid_body", "message": "El cuerpo de la petición debe ser un objeto JSON"}

    name, ending = FIELD_NAMES.get(field, (f"El campo «{field}»", "o"))
    if error_type == "missing":
        return {"code": "required", "message": f"{name} es obligatori{ending}"}
    if error_type == "extra_forbidden":
        return {"code": "extra_field_not_allowed", "message": f"El campo «{field}» no se puede enviar"}
    if error_type == "literal_error" and field in ALLOWED_VALUES:
        allowed = list(ALLOWED_VALUES[field])
        return {
            "code": "invalid_choice",
            "message": f"{name} no tiene un valor permitido. Valores válidos: {', '.join(allowed)}",
            "allowed": allowed,
        }
    if error_type == "value_error":
        return {"code": "empty_text", "message": f"{name} no puede estar vací{ending}"}
    if error_type == "string_type":
        return {"code": "invalid_type", "message": f"{name} debe ser un texto"}
    return {"code": "invalid_value", "message": f"{name} no es válid{ending}"}


async def validation_error_handler(request: Request, exc: RequestValidationError):
    if not _is_incident_manager_path(request.url.path):
        return await request_validation_exception_handler(request, exc)

    errors = []
    for error in exc.errors():
        field = _field(tuple(error["loc"]))
        errors.append({"field": field, **_describe(field, error["type"])})
    return JSONResponse(
        status_code=400,
        content={"detail": "Datos no válidos", "code": "validation_error", "errors": errors},
    )


async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code, **exc.extra},
    )


async def catch_unhandled_errors(request: Request, call_next):
    """Middleware: convierte cualquier excepción no controlada en un 500 genérico.
    Al estar por dentro de CORSMiddleware, la respuesta lleva access-control-allow-origin."""
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Error no controlado en %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content=INTERNAL_ERROR)


async def unhandled_error_handler(request: Request, exc: Exception):
    # Red de seguridad si algo escapa al middleware (p. ej. un fallo en otro middleware).
    # Esta respuesta sale de ServerErrorMiddleware, por fuera de CORS. Starlette vuelve a
    # lanzar la excepción después, así que uvicorn escribe el traceback en el log
    return JSONResponse(status_code=500, content=INTERNAL_ERROR)


def register_error_handlers(app: FastAPI) -> None:
    """Llamar ANTES de app.add_middleware(CORSMiddleware): el último middleware añadido
    es el más externo, así que CORS envuelve a catch_unhandled_errors."""
    app.middleware("http")(catch_unhandled_errors)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
