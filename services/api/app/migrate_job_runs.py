"""Crea la tabla `job_runs` (procesos en segundo plano) en Supabase.

Uso (desde services/api, con DATABASE_URL de Supabase en .env):
  uv run migrate-job-runs --dry-run   # solo muestra el SQL
  uv run migrate-job-runs             # lo aplica (idempotente: IF NOT EXISTS)

La API también la crea al arrancar (create_all) y `scripts/nightly_export.py` antes de su
primera ejecución, así que esto solo hace falta para crearla a mano o revisarla.
"""
import argparse

from app.database import engine
from app.services.job_runner import JOB_RUNS_SQL, ensure_job_runs_table


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Crea la tabla job_runs")
    parser.add_argument("--dry-run", action="store_true", help="solo muestra el SQL")
    args = parser.parse_args(argv)
    if args.dry_run:
        print(JOB_RUNS_SQL)
        return
    ensure_job_runs_table(engine)
    print("job_runs lista")


if __name__ == "__main__":
    main()
