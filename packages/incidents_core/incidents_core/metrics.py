from .constants import VALID_CATEGORIES, VALID_STATUSES


def count_by_category(valid: list[dict[str, str]]) -> dict[str, int]:
    """Cuenta registros válidos por categoría, en el orden de VALID_CATEGORIES.
    Esperado: TECHNICAL 28, BILLING 18, ACCESS 21, HR_QUERY 17, COMPLAINT 12."""
    raise NotImplementedError


def count_by_status(valid: list[dict[str, str]]) -> dict[str, int]:
    """Cuenta registros válidos por estado, en el orden de VALID_STATUSES.
    Esperado: OPEN 27, CLOSED 56, DISCARDED 13."""
    raise NotImplementedError


def satisfaction_stats(valid: list[dict[str, str]]) -> dict:
    """Solo tickets CLOSED con score. Devuelve:
    {"closed": 56, "scored": 56, "average": 3.84,
     "distribution": {1: 2, 2: 5, 3: 10, 4: 22, 5: 17}}
    Ojo: el score llega como texto ("4"), hay que convertirlo.
    average redondeado a 2 decimales."""
    raise NotImplementedError