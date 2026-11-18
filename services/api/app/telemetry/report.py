"""GET /telemetry/report: período por defecto, validación de fechas y caché de 60 s.

El endpoint nunca calcula en cada petición: llama a build_report (analysis.py) solo si la
misma combinación start_date/end_date no está en caché o ha caducado.
"""
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from threading import Lock

DEFAULT_WINDOW = timedelta(days=7)
MAX_WINDOW = timedelta(days=92)
CACHE_TTL_SECONDS = 60


def to_utc(value: datetime) -> datetime:
    """Fechas sin zona se interpretan como UTC; con zona, se pasan a UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def resolve_period(
    start_date: datetime | None, end_date: datetime | None, now: datetime | None = None
) -> tuple[datetime, datetime]:
    """[start, end) en UTC. Por defecto los últimos 7 días.

    `now` se redondea al minuto siguiente: así las peticiones sin parámetros de un mismo
    minuto comparten clave de caché (si no, cada petición tendría un `now` distinto y la
    caché no serviría nunca) y los eventos del minuto en curso entran en el período (con
    el redondeo hacia abajo quedaban fuera hasta el minuto siguiente).
    """
    now = to_utc(now or datetime.now(UTC)).replace(second=0, microsecond=0) + timedelta(minutes=1)
    end = to_utc(end_date) if end_date else now
    start = to_utc(start_date) if start_date else end - DEFAULT_WINDOW
    if start >= end:
        raise ValueError("start_date debe ser anterior a end_date")
    if end - start > MAX_WINDOW:
        raise ValueError(f"El período máximo es de {MAX_WINDOW.days} días")
    return start, end


class ReportCache:
    """Caché en memoria con TTL, por (start, end)."""

    def __init__(self, ttl_seconds: float = CACHE_TTL_SECONDS, clock: Callable[[], float] = time.monotonic):
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self._data: dict[tuple[datetime, datetime], tuple[float, dict]] = {}
        self._lock = Lock()

    def get_or_compute(self, key: tuple[datetime, datetime], compute: Callable[[], dict]) -> dict:
        now = self._clock()
        with self._lock:
            hit = self._data.get(key)
            if hit and hit[0] > now:
                return hit[1]
        value = compute()
        with self._lock:
            # Las entradas caducadas se limpian al escribir: la caché no crece sin límite
            self._data = {k: v for k, v in self._data.items() if v[0] > now}
            self._data[key] = (self._clock() + self.ttl_seconds, value)
        return value

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


report_cache = ReportCache()
