"""Analizador de incidencias de Nexova.
Uso: python analyze.py <ruta_al_csv>
"""
import csv
import sys
from pathlib import Path

from incidents_core.analysis import analyze_rows
from incidents_core.constants import RULES, SCORE_LABELS
from incidents_core.export import summary_to_csv
from incidents_core.validation import load_csv

SEPARATOR = "=" * 60
YES_ANSWERS = ("s", "si", "sí", "y", "yes")


def leader(label: str, value, width: int = 30) -> str:
    """'Etiqueta ........ valor' con los valores alineados a la derecha."""
    dots = "." * max(2, width - len(label))
    return f"{label} {dots} {str(value).rjust(3)}"


def tree(items: list[str]) -> list[str]:
    """Antepone ├─ / └─ a cada línea."""
    return [
        f"  {'└─' if i == len(items) - 1 else '├─'} {item}"
        for i, item in enumerate(items)
    ]


def pct(part: int, total: int) -> str:
    return f"({part / total * 100:.1f}%)" if total else "(0.0%)"


def print_report(summary: dict, source_name: str) -> None:
    valid = summary["valid_records"]
    sat = summary["satisfaction"]

    print(SEPARATOR)
    print("  NEXOVA — SUPPORT TICKET ANALYSIS")
    print(f"  Source file: {source_name}")
    print(SEPARATOR)
    print()

    print(leader("TOTAL RECORDS IN FILE", summary["total_records"], 37))
    for line in tree([
        leader("Valid records", valid, 32),
        leader("Invalid / incomplete", summary["invalid_records"], 32),
    ]):
        print(line)
    print()

    print("INVALID RECORDS BREAKDOWN")
    invalid_lines = [
        leader(RULES[rule], count, 32)
        for rule, count in summary["invalid_by_rule"].items() if count
    ]
    for line in tree(invalid_lines or ["None"]):
        print(line)
    print()

    print("BREAKDOWN BY CATEGORY (valid records)")
    for line in tree([
        f"{leader(cat, n, 32)}  {pct(n, valid)}"
        for cat, n in summary["by_category"].items()
    ]):
        print(line)
    print()

    print("BREAKDOWN BY STATUS (valid records)")
    for line in tree([
        f"{leader(status, n, 32)}  {pct(n, valid)}"
        for status, n in summary["by_status"].items()
    ]):
        print(line)
    print()

    print("SATISFACTION INDEX (closed tickets)")
    print(f"  Scored tickets: {sat['scored']} of {sat['closed']}")
    print(f"  Average score: {sat['average']:.2f} / 5.00")
    for line in tree([
        leader(f"Score {score} ({SCORE_LABELS[score]})", count, 32)
        for score, count in sat["distribution"].items()
    ]):
        print(line)
    print()
    print(SEPARATOR)


def ask_export() -> bool:
    try:
        answer = input("¿Deseas exportar los resultados a CSV? [s / n]: ")
    except EOFError:
        return False
    return answer.strip().lower() in YES_ANSWERS


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Uso: python analyze.py <ruta_al_csv>", file=sys.stderr)
        return 1

    path = Path(argv[1])
    if not path.is_file():
        print(f"Error: no se encuentra el fichero '{path}'.", file=sys.stderr)
        return 1

    try:
        rows = load_csv(path)
    except (ValueError, UnicodeDecodeError) as error:
        # Los mensajes de error nunca incluyen contenido de registros (emails)
        print(f"Error al leer el CSV: {error}", file=sys.stderr)
        return 1
    except csv.Error:
        print("Error al leer el CSV: el fichero está mal formado.", file=sys.stderr)
        return 1
    except OSError as error:
        # Permisos, fichero bloqueado o borrado entre la comprobación y la lectura
        print(f"Error: no se ha podido abrir '{path}' ({error.strerror}).", file=sys.stderr)
        return 1

    summary = analyze_rows(rows)
    print_report(summary, path.name)

    if ask_export():
        output = Path("results.csv")
        try:
            output.write_text(summary_to_csv(summary), encoding="utf-8")
        except OSError as error:
            print(f"Error: no se ha podido escribir '{output}' ({error.strerror}).", file=sys.stderr)
            return 1
        print(f"Resultados exportados a {output.resolve()}")
    else:
        print("Exportación omitida.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))