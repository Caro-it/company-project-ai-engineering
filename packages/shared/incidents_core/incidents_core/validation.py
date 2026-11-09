import csv
from pathlib import Path

from .constants import (
    AGENT_ID_PATTERN, EXPECTED_FIELDS, MIN_DESCRIPTION_LENGTH, RULES,
    SCORE_MAX, SCORE_MIN, VALID_CATEGORIES, VALID_STATUSES,
)


def load_csv(path: str | Path) -> list[dict[str, str]]:
    """Lee el CSV y comprueba la cabecera. Lanza ValueError si está vacío o mal formado."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        return parse_rows(f.read())


def parse_rows(text: str) -> list[dict[str, str]]:
    """Parsea texto CSV. Separado de load_csv para que la API lo reutilice con el upload."""
    if not text.strip():
        raise ValueError("El fichero está vacío.")
    reader = csv.DictReader(text.splitlines())
    if reader.fieldnames != EXPECTED_FIELDS:
        raise ValueError(
            f"Cabecera incorrecta. Se esperaba: {', '.join(EXPECTED_FIELDS)}"
        )
    rows = list(reader)
    if not rows:
        raise ValueError("El fichero no contiene registros.")
    return rows


def validate_record(row: dict[str, str]) -> list[str]:
    """Devuelve la lista de reglas que incumple el registro (vacía = válido).
    Nunca devuelve valores del registro: así ningún email puede filtrarse."""
    def get(key: str) -> str:
        return (row.get(key) or "").strip()

    problems: list[str] = []

    if not get("client_company"):
        problems.append("missing_client_company")
    if get("category") not in VALID_CATEGORIES:
        problems.append("invalid_category")
    if len(get("description")) < MIN_DESCRIPTION_LENGTH:
        problems.append("invalid_description")
    if not AGENT_ID_PATTERN.match(get("agent_id")):
        problems.append("invalid_agent_id")
    if "@" not in get("customer_email"):
        problems.append("invalid_email")

    status = get("status")
    if status not in VALID_STATUSES:
        problems.append("invalid_status")

    score_raw = get("satisfaction_score")
    if score_raw:
        try:
            score = int(score_raw)
            if not SCORE_MIN <= score <= SCORE_MAX:
                problems.append("score_out_of_range")
        except ValueError:
            problems.append("score_out_of_range")
    elif status == "CLOSED":
        problems.append("closed_without_score")

    return problems


def split_records(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], dict[str, int], int]:
    """Separa válidos e inválidos.
    Devuelve: (registros_validos, conteo_por_regla, total_invalidos)."""
    valid: list[dict[str, str]] = []
    rule_counts = {key: 0 for key in RULES}
    invalid_total = 0

    for row in rows:
        problems = validate_record(row)
        if problems:
            invalid_total += 1
            for p in problems:
                rule_counts[p] += 1
        else:
            valid.append(row)

    return valid, rule_counts, invalid_total