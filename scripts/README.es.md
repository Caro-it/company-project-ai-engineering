# Carpeta `scripts`

Esta carpeta contiene **scripts auxiliares** del monorepo: automatizaciones de desarrollo, utilidades de mantenimiento, tareas repetitivas (setup, lint, migraciones, generación de datos, etc.) y tooling interno.

- **Propósito principal**: agrupar herramientas de soporte que no pertenecen a una app/agente/pipeline específico, pero facilitan el trabajo del equipo.
- **Recomendación**: documenta cada script (qué hace, parámetros, requisitos, ejemplos de uso) y procura que sean reproducibles (y seguros) en distintos entornos.

## Scripts

| Script | Qué hace |
| --- | --- |
| `seed_incidents.py` | Carga las incidencias de `incidents-nexova.csv` en la API |
| `analyze.py` | Análisis del CSV de incidencias |
| `nightly_export.py` | Script nocturno de telemetría (DEV-53): CSV de ayer en `data/raw/`, pipeline y registro en `job_runs`. Ver [`docs/background-jobs/nightly-export.md`](../docs/background-jobs/nightly-export.md) |
| `cron/` | Disparadores del script nocturno: crontab (Linux/macOS) y Programador de tareas (Windows) |
