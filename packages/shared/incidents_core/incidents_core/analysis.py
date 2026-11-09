from .metrics import count_by_category, count_by_status, satisfaction_stats
from .validation import split_records


def analyze_rows(rows: list[dict[str, str]]) -> dict:
    """Punto de entrada único del análisis. Lo usan el script y la API."""
    valid, rule_counts, invalid_total = split_records(rows)
    return {
        "total_records": len(rows),
        "valid_records": len(valid),
        "invalid_records": invalid_total,
        "invalid_by_rule": rule_counts,
        "by_category": count_by_category(valid),
        "by_status": count_by_status(valid),
        "satisfaction": satisfaction_stats(valid),
    }