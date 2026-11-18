# Cola de tareas con Redis y Celery (DEV-55)

```
Cliente → API (productor) → Redis (broker) → worker de Celery (consumidor) → resultado en Redis
```

## Operación convertida: `POST /reporting/pipeline-runs`

Es la operación más lenta de la API: recalcula el Reporte Semanal de Desempeño arrancando el
flow de Prefect del Hito 6. Lee la telemetría, calcula los KPIs y hace upsert en `reporting`.
En local tarda unos 12 s, y la primera vez más, porque Prefect levanta su servidor temporal.
Si Supabase falla, puede pasar de 100 s, porque la task de extracción ya reintenta dentro de
Prefect.

Antes corría con `BackgroundTasks` **dentro del proceso de uvicorn**: ocupaba la API, se perdía
si uvicorn se reiniciaba y un fallo no se reintentaba. Ahora:

| | Antes | Ahora |
| --- | --- | --- |
| Quién ejecuta | El proceso de la API | Un worker de Celery (otro proceso u otro contenedor) |
| Respuesta | `202` con `run_id` | `202` con `task_id` y `run_id`, en ~30 ms (medido: 30 ms; la primera petición tras arrancar, 150 ms) |
| Estado | Solo `GET /reporting/pipeline-runs/latest` | `GET /tasks/{task_id}` (`pending`, `started`, `retry`, `success`, `failure`) |
| Fallo | Se perdía | 3 reintentos con backoff y, si sigue fallando, Dead Letter Queue |
| Reinicio de la API | La ejecución moría | El mensaje sigue en Redis y el worker lo procesa |

El dashboard `/reporting` del backoffice sigue la tarea con `GET /tasks/{task_id}` cada 3 s.
Mientras tanto muestra «en cola», «calculando…», «se reintenta automáticamente (reintento N
de 3)» o el fallo final, y deshabilita el botón.

## Piezas

| Pieza | Archivo |
| --- | --- |
| Instancia de Celery (broker y backend Redis, `acks_late`, timeouts, logs) | `services/api/app/celery_app.py` |
| Tarea `reporting.run_weekly_pipeline` | `services/api/app/tasks/reporting.py` |
| Dead Letter Queue (`task_dead_letters`) | `services/api/app/services/task_dead_letters.py` |
| `GET /tasks/{task_id}`, `GET /tasks/dead-letters` | `services/api/app/routers/tasks.py` |
| Productor | `POST /reporting/pipeline-runs` en `services/api/app/routers/reporting.py` |
| Redis, worker y Flower | `docker-compose.yml` |
| Tests | `services/api/tests/test_tasks.py`, `services/api/tests/test_reporting_api.py` |

> El enunciado sugiere `services/celery_app.py`; aquí es `services/api/app/celery_app.py`,
> dentro del paquete de la API, como el resto del código del backend. El worker se arranca con
> `celery -A app.celery_app worker` desde `services/api`.

## Reglas del patrón y cómo se cumplen

- **Mensajes ligeros.** El mensaje lleva `{"run_id": "<uuid>", "trigger": "manual"}`, sin
  datos; el worker lee la telemetría de la base de datos. Hay un test que lo comprueba
  (`test_message_carries_only_ids`).
- **ACK solo tras éxito.**
  - `task_acks_late=True` y `task_reject_on_worker_lost=True`: si el worker muere a mitad, el
    mensaje vuelve a la cola.
  - `worker_prefetch_multiplier=1`: el worker no se guarda mensajes en su buffer.
  - `visibility_timeout` (40 min) es mayor que el timeout de la tarea, así Redis no reentrega
    una tarea que sigue viva.
- **Toda tarea tiene timeout.** `task_soft_time_limit=25 min` y `task_time_limit=30 min`.
- **Reintentos con backoff.**
  - `max_retries=3` y `countdown = TASK_RETRY_BASE_SECONDS · 2^reintento`, que da 10 s, 20 s
    y 40 s. Nunca reintenta al instante.
  - En total son 4 intentos: el original y 3 reintentos.
  - Cada intento deja su propia fila en `reporting.pipeline_runs`. El primero usa el `run_id`
    que devolvió la API.
- **DLQ.** Al agotar los reintentos, la tarea queda en `FAILURE` y la señal `task_failure`
  guarda en `task_dead_letters`:
  - `task_id`, `task_name`, `attempts` (4), `error_message`, `task_args` (los ids del
    mensaje) y `failed_at`.
  - `task_id` es único, así que el mismo fallo no se registra dos veces.
- **`job_runs` (cron nocturno) ≠ `task_dead_letters` (cola) ≠ `pipeline_runs` (ETL).** Cada
  tabla registra una capa distinta.

`GET /tasks/{task_id}` lee el estado de Redis (`result_extended`: nombre y nº de reintentos) y,
si la tarea falló, añade su registro de la DLQ. Celery no distingue un `task_id` inexistente de
una tarea todavía en cola: los dos se ven `pending`.

## Levantarlo

### Con Docker (recomendado)

```bash
cp .env.example .env      # si aún no existe; REDIS_URL lo pone docker-compose
docker compose up --build # uis, api, redis, worker y flower
```

- API → http://localhost:8000/docs · Flower → http://localhost:5555
- Parar solo el worker: `docker compose stop worker`; volver a arrancarlo: `docker compose start worker`.
- Logs del worker: `docker compose logs -f worker`.
- Más workers: `docker compose up -d --scale worker=2`.

Redis va con `--maxmemory-policy noeviction`: si se llena, rechaza escrituras en vez de borrar
mensajes de la cola. También va con `--appendonly yes`, así los mensajes sobreviven a un
reinicio del contenedor.

> VPS de 957 MiB: redis, worker y flower añaden memoria. En el VPS se puede levantar sin Flower
> (`docker compose up -d uis api redis worker`).

### Sin Docker (Windows, la API con `uv run`)

Redis no tiene versión oficial para Windows: se levanta solo Redis con Docker y el resto en local.

```powershell
docker compose up -d redis
cd services\api
# terminal 1: la API
uv run uvicorn app.main:app --reload
# terminal 2: el worker. En Windows, --pool=solo (el pool prefork de Celery no funciona en Windows)
uv run celery -A app.celery_app worker --loglevel=INFO --pool=solo
# terminal 3: Flower
uv run celery -A app.celery_app flower --port=5555
```

Para parar el worker: `Ctrl+C`. Con `acks_late`, una tarea que estuviera a medias vuelve a la cola.

## Logs

Cada ejecución registra `task_id`, intento, estado y duración. Los fallos registran además el
error y, el definitivo, la traza completa. Ejecución real con el worker y Redis (PostgreSQL
local, `TASK_RETRY_BASE_SECONDS=2`), con la tabla `telemetry_events` renombrada para simular
la caída:

```text
[22:55:21 INFO] task_id=f41c620a-… task=reporting.run_weekly_pipeline attempt=1 status=started
[22:55:33 INFO] task_id=f41c620a-… task=reporting.run_weekly_pipeline attempt=1 status=success duration=11.63s

[22:55:38 INFO] task_id=823085b5-… task=reporting.run_weekly_pipeline attempt=1 status=started
[22:57:19 WARNING] task_id=823085b5-… attempt=1 status=retry next_in=2s error='… UndefinedTable: relation "telemetry_events" does not exist …'
[22:57:20 INFO] task_id=823085b5-… attempt=2 status=started
[22:59:01 WARNING] task_id=823085b5-… attempt=2 status=retry next_in=4s error='…'
[22:59:05 INFO] task_id=823085b5-… attempt=3 status=started
[23:00:45 WARNING] task_id=823085b5-… attempt=3 status=retry next_in=8s error='…'
[23:00:53 INFO] task_id=823085b5-… attempt=4 status=started
[23:02:34 ERROR] task_id=823085b5-… task=reporting.run_weekly_pipeline attempt=4 status=failure error='(psycopg2.errors.UndefinedTable) relation "telemetry_events" does not exist …'
Traceback (most recent call last):
  …
[23:02:34 INFO] task_id=823085b5-… task=reporting.run_weekly_pipeline attempt=4 status=failure duration=100.43s
```

Y en la DLQ (`GET /tasks/dead-letters`):

```json
[{"task_id": "823085b5-f19b-43ee-b462-db6b117601f0", "task_name": "reporting.run_weekly_pipeline",
  "attempts": 4, "error_message": "ProgrammingError: (psycopg2.errors.UndefinedTable) relation \"telemetry_events\" does not exist …",
  "task_args": {"args": [], "kwargs": {"run_id": "…", "trigger": "manual"}}, "failed_at": "2026-11-18T22:02:34Z"}]
```

Cada intento tarda ~100 s porque la task de extracción del pipeline ya reintenta 3 veces dentro
de Prefect (10 + 30 + 60 s). Los reintentos de Celery son para cuando falla el flow entero.

## Verificado

- `uv run pytest` (Celery en modo eager, sin Redis):
  - éxito consultable;
  - fallo transitorio que se recupera al tercer intento;
  - 4 intentos y DLQ con `task_id`, intentos y error;
  - `GET /tasks/{id}` en cada estado;
  - `503` si Redis no responde;
  - permisos;
  - el mensaje lleva solo ids.
- Con Redis 7, un worker real y Flower (PostgreSQL 16 local):
  - `202` en 30 ms (150 ms la primera petición tras arrancar);
  - estados `started` → `success`;
  - la caída simulada da 3 reintentos con 2, 4 y 8 s de espera, el 4.º intento termina en
    `failure` y la fila queda en `task_dead_letters`.
  - Flower muestra las dos tareas: `docs/screenshots/message-queue/flower-tareas.png` y
    `flower-workers.png`.
  - **Worker y API independientes:** con el worker parado, la API encoló la tarea (`pending`,
    `LLEN celery` = 1 en Redis); se paró también la API, se arrancó el worker y la procesó
    (`success`, 11 s). La cola quedó vacía.
- Los e2e del backoffice usan `CELERY_TASK_ALWAYS_EAGER=true`, sin Redis.
- **No probado aquí: `docker compose up`.** Docker Hub no es accesible desde el entorno donde se
  preparó la rama; `docker compose config` sí valida el archivo. Pendiente de levantarlo en local.
