"""Seed del Gestor de Incidencias: carga el CSV del analizador en la BD de la API.

Uso (con el entorno de services/api):
    services/api/.venv/Scripts/python scripts/seed_incidents.py [ruta_al_csv]

Reutiliza la validación del analizador (incidents_core) y transforma cada fila
según docs/CONTEXT-incident-manager-nexova.md. Es idempotente: los ticket_id
importados se guardan en la tabla incident_seed_log, no en la incidencia.
"""
import csv
import sys
import uuid
from pathlib import Path

from pydantic import ValidationError
from tinydb import Query
from tinydb.table import Table

from app.incident_models import Incident
from incidents_core.constants import RULES
from incidents_core.incident_model import MAPPING_ERRORS, csv_row_to_incident
from incidents_core.validation import load_csv, split_records

DEFAULT_CSV = Path(__file__).resolve().parent / "incidents-nexova.csv"
SEPARATOR = "=" * 60


def source_key(row: dict[str, str], incident: dict) -> dict:
    """Identificador del registro de origen: ticket_id o, si falta, title + created_at."""
    ticket_id = (row.get("ticket_id") or "").strip()
    if ticket_id:
        return {"ticket_id": ticket_id}
    return {"title": incident["title"], "created_at": incident["created_at"]}


def run(rows: list[dict[str, str]], incidents: Table, seed_log: Table) -> dict:
    """Valida, transforma e inserta. Recibe las tablas para poder probarlo
    sobre una BD aparte. Devuelve solo contadores (nunca datos de registros)."""
    valid, rule_counts, invalid_total = split_records(rows)
    mapping_counts = {key: 0 for key in MAPPING_ERRORS}
    unmapped_total = 0
    inserted = 0
    existing = 0

    for row in valid:
        raw, problems = csv_row_to_incident(row)
        if problems:
            unmapped_total += 1
            for p in problems:
                mapping_counts[p] += 1
            continue

        key = source_key(row, raw)
        if seed_log.contains(Query().fragment(key)):
            existing += 1
            continue

        incident_id = str(uuid.uuid4())
        try:
            # Pasa por Pydantic: el seed cumple las mismas reglas que la API
            incident = Incident(id=incident_id, **raw)
        except ValidationError:
            # No se imprime el error: incluiría valores del registro
            unmapped_total += 1
            continue

        incidents.insert(incident.model_dump(mode="json"))
        seed_log.insert({**key, "incident_id": incident_id})
        inserted += 1

    return {
        "read": len(rows),
        "inserted": inserted,
        "existing": existing,
        "invalid": invalid_total,
        "invalid_by_rule": rule_counts,
        "unmapped": unmapped_total,
        "unmapped_by_reason": mapping_counts,
    }


def print_report(report: dict, source_name: str) -> None:
    # Solo ASCII: la consola de Windows (cp1252) no imprime otros caracteres
    print(SEPARATOR)
    print("  NEXOVA - INCIDENT SEED")
    print(f"  Source file: {source_name}")
    print(SEPARATOR)
    print(f"Rows read ............................ {report['read']:>3}")
    print(f"Inserted ............................. {report['inserted']:>3}")
    print(f"Already imported (skipped) ........... {report['existing']:>3}")
    print(f"Invalid (discarded) .................. {report['invalid']:>3}")
    for rule, count in report["invalid_by_rule"].items():
        if count:
            print(f"  - {RULES[rule]}: {count}")
    print(f"Not mappable (discarded) ............. {report['unmapped']:>3}")
    for reason, count in report["unmapped_by_reason"].items():
        if count:
            print(f"  - {MAPPING_ERRORS[reason]}: {count}")
    print(SEPARATOR)


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Uso: python seed_incidents.py [ruta_al_csv]", file=sys.stderr)
        return 1

    path = Path(argv[1]) if len(argv) == 2 else DEFAULT_CSV
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

    # Import diferido: abrir la BD real solo al ejecutar el seed, no al importar run()
    from app.database import incident_seed_log_table, incidents_table

    report = run(rows, incidents_table, incident_seed_log_table)
    print_report(report, path.name)

    # Todas las filas descartadas (ni insertadas ni ya importadas): un pipeline no debe darlo por bueno
    if report["read"] > 0 and report["inserted"] == 0 and report["existing"] == 0:
        print(
            f"Error: se han descartado las {report['read']} filas "
            f"({report['invalid']} no válidas, {report['unmapped']} no mapeables). "
            "Revisa el desglose del informe.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
