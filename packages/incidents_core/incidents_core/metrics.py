from .constants import VALID_CATEGORIES, VALID_STATUSES


def count_by_category(valid: list[dict[str, str]]) -> dict[str, int]:
    """Cuenta registros válidos por categoría, en el orden de VALID_CATEGORIES.
    Esperado: TECHNICAL 28, BILLING 18, ACCESS 21, HR_QUERY 17, COMPLAINT 12."""
    counts = {category: 0 for category in VALID_CATEGORIES}
    for row in valid:
        counts[row["category"]] += 1
    return counts


def count_by_status(valid: list[dict[str, str]]) -> dict[str, int]:
    """Cuenta registros válidos por estado, en el orden de VALID_STATUSES.
    Esperado: OPEN 27, CLOSED 56, DISCARDED 13."""
    counts = {status: 0 for status in VALID_STATUSES}
    for row in valid:
        counts[row["status"]] += 1
    return counts


def satisfaction_stats(valid: list[dict[str, str]]) -> dict:
    """Solo tickets CLOSED con score. Devuelve:
    {"closed": 56, "scored": 56, "average": 3.84,
     "distribution": {1: 2, 2: 5, 3: 10, 4: 22, 5: 17}}
    El score llega como texto ("4"), por eso se convierte con int().
    average redondeado a 2 decimales."""
    closed = [row for row in valid if row["status"] == "CLOSED"]
    scores = [int(row["satisfaction_score"]) for row in closed if row["satisfaction_score"].strip()]

    distribution = {score: 0 for score in range(1, 6)}
    for s in scores:
        distribution[s] += 1

    average = round(sum(scores) / len(scores), 2) if scores else 0.0

    return {
        "closed": len(closed),
        "scored": len(scores),
        "average": average,
        "distribution": distribution,
    }