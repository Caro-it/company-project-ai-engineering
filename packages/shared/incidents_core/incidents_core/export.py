import csv
import io


def summary_to_rows(summary: dict) -> list[list[str]]:
    """Una fila por métrica: [seccion, metrica, valor]. Nunca incluye datos de clientes."""
    rows: list[list[str]] = [
        ["totals", "total_records", str(summary["total_records"])],
        ["totals", "valid_records", str(summary["valid_records"])],
        ["totals", "invalid_records", str(summary["invalid_records"])],
    ]
    for rule, count in summary["invalid_by_rule"].items():
        rows.append(["invalid_by_rule", rule, str(count)])
    for category, count in summary["by_category"].items():
        rows.append(["by_category", category, str(count)])
    for status, count in summary["by_status"].items():
        rows.append(["by_status", status, str(count)])

    sat = summary["satisfaction"]
    rows.append(["satisfaction", "closed_tickets", str(sat["closed"])])
    rows.append(["satisfaction", "scored_tickets", str(sat["scored"])])
    rows.append(["satisfaction", "average_score", f"{sat['average']:.2f}"])
    for score, count in sat["distribution"].items():
        rows.append(["satisfaction", f"score_{score}", str(count)])
    return rows


def summary_to_csv(summary: dict) -> str:
    """Devuelve el CSV como texto (el script lo guarda en disco; la API lo devuelve en la respuesta)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["section", "metric", "value"])
    writer.writerows(summary_to_rows(summary))
    return buffer.getvalue()
