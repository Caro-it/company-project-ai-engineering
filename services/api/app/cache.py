"""Caché en memoria con TTL para lecturas caras y repetidas (proyecto Caching).

Por qué en proceso y no Redis: la API corre como un único proceso uvicorn (también en
Docker, ver infra/). Un diccionario con TTL basta y no añade un servicio más al
docker-compose. Si algún día se arrancan varios workers, cada uno tendría su propia
copia y la invalidación solo llegaría al worker que atendió la escritura: ese sería el
momento de pasar a Redis (ver CACHING_REPORT.md).

Reglas de uso:
- Toda entrada caduca (TTL obligatorio): sin TTL un dato obsoleto viviría para siempre.
- Solo datos compartidos entre usuarios. Nada personal ni de sesión en una clave
  compartida; si hiciera falta, la clave tendría que incluir el id del usuario.
- Las escrituras que cambian los datos llaman a invalidate() del grupo afectado.
"""
import time
from collections.abc import Callable, Hashable
from dataclasses import dataclass
from threading import Lock
from typing import Any


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    """Diccionario clave → valor con caducidad. Seguro entre hilos (FastAPI ejecuta los
    endpoints síncronos en un pool de hilos)."""

    def __init__(self, name: str, ttl_seconds: float, clock: Callable[[], float] = time.monotonic):
        self.name = name
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self._data: dict[Hashable, _Entry] = {}
        self._lock = Lock()
        self.hits = 0
        self.misses = 0
        self._generation = 0

    def get_or_set(self, key: Hashable, compute: Callable[[], Any]) -> Any:
        """Devuelve el valor cacheado o lo calcula, lo guarda y lo devuelve.

        El cálculo se hace fuera del lock para no bloquear otras claves mientras se
        consulta la base de datos. Si dos peticiones fallan a la vez, ambas calculan
        y la última escritura gana: el resultado es el mismo, solo se pierde una
        consulta, y se evita mantener un lock durante una llamada de red.
        """
        now = self._clock()
        with self._lock:
            entry = self._data.get(key)
            if entry is not None and entry.expires_at > now:
                self.hits += 1
                return entry.value
            self.misses += 1
            # Versión del caché en el momento del fallo: si alguien invalida mientras
            # calculamos, el valor calculado ya puede estar obsoleto y no se guarda
            generation = self._generation

        value = compute()

        with self._lock:
            if generation == self._generation:
                self._data[key] = _Entry(value, self._clock() + self.ttl_seconds)
        return value

    def invalidate(self) -> None:
        """Vacía todo el grupo. Se llama tras cualquier escritura que lo afecte."""
        with self._lock:
            self._data.clear()
            self._generation += 1

    def stats(self) -> dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "ttl_seconds": self.ttl_seconds,
                "entries": len(self._data),
                "hits": self.hits,
                "misses": self.misses,
            }

    def reset_stats(self) -> None:
        with self._lock:
            self.hits = 0
            self.misses = 0


# --- Cachés de la API -----------------------------------------------------------------
# TTL según lo que tarda en cambiar cada dato y cuánto daño hace verlo desactualizado
# (justificación completa en CACHING_REPORT.md).

# GET /api/incidents/summary: recorre TODAS las incidencias en cada llamada y el
# backoffice lo pide en cada carga de /incidencias y tras cada cambio de estado.
incidents_summary_cache = TTLCache("incidents_summary", ttl_seconds=30)

# GET /inventory/products: SUM de entradas y salidas por activo en Supabase (red +
# dos agregaciones). Clave = filtros (office, category).
inventory_products_cache = TTLCache("inventory_products", ttl_seconds=60)

ALL_CACHES = (incidents_summary_cache, inventory_products_cache)


def clear_all() -> None:
    """Vacía todos los cachés y sus contadores (tests y scripts de seed)."""
    for cache in ALL_CACHES:
        cache.invalidate()
        cache.reset_stats()
