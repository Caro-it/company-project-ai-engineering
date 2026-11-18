# Script nocturno de telemetría (DEV-53)

Proceso en segundo plano que, cada noche y sin intervención manual:

1. exporta los eventos de `telemetry_events` del día anterior (UTC) a
   `data/raw/telemetry_YYYY-MM-DD.csv`, solo si el archivo no existe;
2. lanza el pipeline de datos del Hito 6 como subproceso;
3. deja constancia de qué pasó y cuándo en la tabla `job_runs`.

| Pieza | Archivo |
| --- | --- |
| Script (CLI, proceso independiente) | `scripts/nightly_export.py` |
| Control de estado (`job_runs`) | `services/api/app/services/job_runner.py` |
| Migración de `job_runs` | `uv run migrate-job-runs` (desde `services/api`) o el SQL `JOB_RUNS_SQL` del módulo |
| Disparador Linux/macOS | `scripts/cron/nightly_export.crontab` |
| Disparador Windows | `scripts/cron/register-windows-task.ps1` + `scripts/cron/nightly_export.cmd` |
| Tests | `services/api/tests/test_job_runner.py`, `services/api/tests/test_nightly_export.py` |

> El enunciado pide la lógica de estado en `services/`: aquí vive en `services/api/app/services/`
> (el paquete de servicios de la API, como `inventory.py` o `password_reset.py`). El script la
> importa sin importar FastAPI ni `app.main`, así que no comparte proceso ni hilo con la API.

## Ejecutar

Desde la raíz del monorepo (PowerShell igual):

```bash
# ayer en UTC
uv run --project services/api python scripts/nightly_export.py
# otro día, sin tocar código
TARGET_DATE=2026-11-17 uv run --project services/api python scripts/nightly_export.py
```

En PowerShell: `$env:TARGET_DATE="2026-11-17"; uv run --project services/api python scripts/nightly_export.py`
(y después `Remove-Item Env:TARGET_DATE`).

Usa el `DATABASE_URL` de `services/api/.env` (Supabase). La tabla `job_runs` se crea sola la
primera vez. Código de salida: `0` completado u omitido, `1` fallido.

## Máquina de estados y lock

```
pending → processing → completed
                    ↘ failed
```

| Paso | Qué hace el script |
| --- | --- |
| Antes de nada | Las filas `processing`/`pending` de más de 6 h (`JOB_STALE_AFTER_HOURS`) pasan a `failed`: son de un proceso que murió de golpe (SIGKILL, apagón) y que ningún `try/finally` puede cerrar |
| Idempotencia | Si ya hay un `completed` para `(nightly_export, target_date)`, log `skipped_duplicate` y fin: ni CSV ni pipeline |
| Lock | Si hay una fila `processing` de `nightly_export`, log `skipped_locked` y fin |
| `pending` | Se crea la fila antes de empezar el trabajo |
| `processing` | Se toma el lock. Un **índice único parcial** (`job_name` WHERE `status = 'processing'`) hace que la base de datos solo deje pasar a una instancia aunque dos lleguen a la vez; la que pierde borra su fila `pending` y sale con `skipped_locked`. No hay tabla ni columna de lock aparte: el lock es el estado |
| Trabajo | CSV (si no existe; se escribe en `.tmp` y se renombra, así un CSV a medias nunca cuenta) → pipeline |
| `completed` | Solo si todo terminó bien |
| `failed` | Cualquier excepción: estado `failed` con `Tipo: mensaje` en `error_message` y traza en el log. `KeyboardInterrupt` y `SIGTERM` también acaban en `failed` (bloque `finally`) |

Un día `failed` no cuenta como hecho: la siguiente ejecución (o una manual con `TARGET_DATE`)
lo reintenta. El CSV que ya se hubiera escrito no se reescribe.

## `job_runs` ≠ `pipeline_runs`

| Tabla | Capa | Qué registra |
| --- | --- | --- |
| `job_runs` | Orquestación nocturna (este script) | Export CSV, lanzar el pipeline, lock e idempotencia por día |
| `reporting.pipeline_runs` | ETL del Hito 6 | Fases extract/transform/load, eventos extraídos, filas escritas |

El CSV es copia de respaldo y auditoría: el pipeline lee `telemetry_events` de la base de datos,
nunca el CSV.

**Pipeline lanzado:** `python data/pipelines/pipeline.py --trigger scheduled --from-week <lunes> --to-week <lunes>`,
la semana (lunes, UTC) que contiene el día objetivo. El pipeline del Hito 6 es semanal y hace
upsert, así que recalcular la semana cada noche no duplica filas y deja el reporte al día.
`NIGHTLY_PIPELINE_CMD` lo sustituye (tests).

## Disparador: crontab del sistema

**Expresión:** `15 2 * * *` con `CRON_TZ=UTC` → todos los días a las 02:15 UTC.

**Decisión:** crontab del sistema operativo (en Windows, el Programador de tareas), no un
scheduler dentro de FastAPI:

- El job no puede bloquear la API ni compartir su hilo: con APScheduler o un hook del lifespan
  correría dentro del proceso de uvicorn, y con varios workers se dispararía una vez por worker.
- Un proceso nuevo por ejecución no arrastra estado ni memoria de la anterior, y si falla no
  tumba la API.
- No hace falta un servicio más: cron ya está en cualquier servidor Linux. En producción con
  contenedores, la misma línea iría en un contenedor scheduler dedicado.
- ¿Por qué no un deployment de Prefect? El pipeline ya usa Prefect, pero el script tiene que
  funcionar aunque no haya servidor de Prefect, y el ticket pide cron.
- 02:15 UTC: el día anterior ya está cerrado y han llegado los eventos rezagados de la cola
  del navegador; no coincide con la ejecución semanal del pipeline (lunes 06:00 Madrid).

**Instalar:**

- Linux/macOS/WSL: `crontab -e` y pegar `scripts/cron/nightly_export.crontab` (cambiando `REPO`).
- Windows: `powershell -ExecutionPolicy Bypass -File scripts\cron\register-windows-task.ps1`
  (03:15 hora de Madrid, que es 02:15 UTC en invierno).

La salida va a `logs/nightly_export.log` (ignorado por git).

## Logs

Una línea por evento, con timestamp UTC, nombre del job, estado y día objetivo:

```text
2026-11-18T21:29:34Z INFO job=nightly_export status=pending target_date=2026-11-17 run_id=faf72539-… registrado
2026-11-18T21:29:34Z INFO job=nightly_export status=processing target_date=2026-11-17 run_id=faf72539-… inicio
2026-11-18T21:29:34Z INFO job=nightly_export status=processing target_date=2026-11-17 3 eventos exportados a data/raw/telemetry_2026-11-17.csv
2026-11-18T21:29:53Z INFO job=nightly_export status=processing target_date=2026-11-17 pipeline terminado
2026-11-18T21:29:53Z INFO job=nightly_export status=completed target_date=2026-11-17 run_id=faf72539-… fin
```

Segunda ejecución del mismo día:

```text
2026-11-18T21:29:54Z INFO job=nightly_export status=skipped_duplicate target_date=2026-11-17 ya completado para este día: no se repite
```

Dos instancias a la vez (una trabaja, la otra aborta):

```text
2026-11-18T21:30:15Z INFO job=nightly_export status=skipped_locked target_date=2026-11-17 run_id=… perdió el lock: se aborta
```

Fallo del pipeline:

```text
2026-11-18T21:31:02Z ERROR job=nightly_export status=failed target_date=2026-11-17 run_id=… fallido
Traceback (most recent call last):
  …
RuntimeError: el pipeline terminó con código 1: …
```

## Verificado

- Tests (`uv run pytest tests/test_job_runner.py tests/test_nightly_export.py` desde
  `services/api`): estados, idempotencia por día, CSV que no se reescribe, fallo en el export y
  en el pipeline → `failed`, interrupción y SIGTERM → `failed`, fila huérfana, y **dos procesos
  reales lanzados a la vez** → uno `completed` y otro `skipped_locked`, pipeline una sola vez.
- PostgreSQL 16 local: el mismo arranque simultáneo, tres veces, deja una sola fila `completed`.
  También se probó la creación simultánea de la tabla, que es la primera vez.
- Con el pipeline real del Hito 6 (SQLite): CSV exportado, pipeline `completed` en
  `pipeline_runs`, `job_runs` `completed`; segunda ejecución `skipped_duplicate`.
