# Procesamiento asíncrono de operaciones con un proveedor externo

Ticket del CTO: si un proveedor externo se cae unos minutos, las operaciones que dependen de
él no pueden perderse en silencio.

## Operación migrada: el email de recuperación de contraseña (Resend)

`POST /auth/forgot-password` es la única operación de la API que depende de un servicio de
terceros. Hasta ahora:

- respondía 200 y, en una `BackgroundTasks` **dentro del proceso de uvicorn**, generaba el token
  y llamaba a Resend;
- si Resend fallaba o tardaba, la excepción se escribía en el log y **el email se perdía**: el
  usuario no recibía el enlace y nadie se enteraba (el caso exacto del ticket);
- un reinicio de la API a mitad también perdía el envío.

Ahora:

```
POST /auth/forgot-password ──200 inmediato──▶ cliente
        │ (BackgroundTasks, en la API: solo TinyDB)
        ├─ busca el usuario y crea el token
        └─ email_deliveries: fila "pending" + mensaje {delivery_id} → Redis
                                                              │
                         worker de Celery ◀───────────────────┘
                         ├─ toma la fila (pending → processing)
                         ├─ Resend (cabecera Idempotency-Key)
                         ├─ OK → completed
                         ├─ fallo → pending + reintento con backoff (10, 20, 40 s)
                         └─ 4.º fallo → failed + Dead Letter Queue (task_dead_letters)
```

El token se sigue creando en la API, porque TinyDB es de un solo proceso y la API es su dueña.
El worker solo toca Supabase (`email_deliveries`) y Resend.

### Contrato del mensaje

```json
{"delivery_id": "22be8733-99ba-4d84-8f0c-f3b80c99e2e6"}
```

Solo el id. El destinatario y el enlace los lee el worker de `email_deliveries`. El enlace lleva
el token en claro, así que solo se guarda mientras el envío está pendiente: al terminar, bien o
mal, `payload` se vacía. `GET /email-deliveries` nunca lo devuelve.

## Las tres exigencias

| Exigencia | Implementación |
| --- | --- |
| Fuera del ciclo petición-respuesta | La API responde 200 en ~25 ms; Resend lo llama un worker de Celery (otro proceso/contenedor) |
| Reintentos con backoff, con límite | `max_retries=3`, `countdown = 10 s · 2^reintento` (10, 20, 40 s): 4 intentos como mucho, nunca seguidos |
| Nada se pierde en silencio | Tras el 4.º fallo: `email_deliveries.status = failed` con el error, fila en `task_dead_letters` (DLQ) y log `ERROR` con la traza. Si Redis no está disponible al encolar, la fila queda `failed` con «Cola de tareas no disponible» |

## Idempotencia

Clave por operación: `password_reset:<sha256 del token>`. Cada solicitud de recuperación genera
un token distinto, así que la clave es única por solicitud y no expone el token.

1. **Al encolar.** `idempotency_key` es única en `email_deliveries`: encolar otra vez con la
   misma clave devuelve la fila existente, sin crear otra fila ni otro mensaje.
2. **Antes de procesar.** El worker comprueba que la fila no esté ya `completed` y la toma con
   un `UPDATE … WHERE status = 'pending'`. Si llega dos veces el mismo mensaje (reentrega por
   `acks_late`), solo un worker la procesa. Si un worker muere con la fila en `processing`,
   pasados 10 minutos otro puede volver a tomarla.
3. **En el proveedor.** La misma clave viaja a Resend como cabecera `Idempotency-Key`, una
   opción de su SDK (`resend.Emails.send(params, {"idempotency_key": …})`). Si Resend aceptó un
   envío pero su respuesta se perdió y el worker reintenta, Resend no lo manda otra vez. Es el
   caso «el intento anterior sí tuvo éxito» del enunciado. Cuánto tiempo recuerda Resend cada
   clave lo decide Resend; no está comprobado aquí.

**Prueba** (`services/api/tests/test_async_email.py`):

- `test_same_idempotency_key_twice_sends_once`: encola dos veces con `password_reset:clave-1` y
  comprueba que hay una sola fila y una sola llamada al proveedor. Con otra clave, sí hay un
  segundo envío.
- `test_duplicate_message_for_the_same_delivery_is_skipped`: el mismo mensaje procesado otra vez
  devuelve `skipped_duplicate`, sin llamar al proveedor.

```text
$ uv run pytest tests/test_async_email.py -v
test_forgot_password_goes_through_the_queue PASSED
test_unknown_email_enqueues_nothing PASSED
test_same_idempotency_key_twice_sends_once PASSED
test_duplicate_message_for_the_same_delivery_is_skipped PASSED
test_provider_outage_is_retried_with_backoff_and_recovers PASSED
test_persistent_outage_ends_failed_and_in_the_dlq PASSED
test_without_resend_key_completes_without_retrying PASSED
test_queue_down_leaves_a_visible_failure PASSED
test_claim_only_once_and_stale_claim_is_retaken PASSED
test_email_deliveries_require_admin_or_manager PASSED
```

## Observabilidad

- **Estado consultable:**
  - `GET /email-deliveries/{id}` y `GET /email-deliveries?status=failed` (admin y manager)
    devuelven `pending`, `processing`, `completed` o `failed`, con `attempts`, `last_error`,
    `provider_message_id` y `task_id`.
  - `GET /tasks/{task_id}` da el estado de Celery y `retries`.
  - `GET /tasks/dead-letters` muestra la DLQ.
- **Reintentos registrados:** `email_deliveries.attempts` cuenta los intentos, la DLQ guarda
  `attempts` y cada intento deja su línea de log.
- Sin `RESEND_API_KEY` (desarrollo), la fila queda `completed` sin `provider_message_id` y con
  la nota en `last_error`: no se reintenta, como antes, porque no tiene sentido.

## Fallo simulado del proveedor (ejecución real)

Hecho con Redis, un worker real y PostgreSQL local, y `TASK_RETRY_BASE_SECONDS=2` para no
esperar 70 s. `RESEND_API_KEY` era falsa y la red no llegaba a `api.resend.com`, así que el
proveedor era inalcanzable:

```text
[23:13:02 INFO]    task_id=fff40714-… task=emails.send_delivery attempt=1 status=started
[23:13:02 WARNING] task_id=fff40714-… attempt=1 status=retry next_in=2s error='… ResendError("Request failed: HTTPSConnectionPool(host=\'api.resend.com\' …'
[23:13:04 INFO]    task_id=fff40714-… attempt=2 status=started
[23:13:04 WARNING] task_id=fff40714-… attempt=2 status=retry next_in=4s error='…'
[23:13:08 INFO]    task_id=fff40714-… attempt=3 status=started
[23:13:08 WARNING] task_id=fff40714-… attempt=3 status=retry next_in=8s error='…'
[23:13:16 INFO]    task_id=fff40714-… attempt=4 status=started
[23:13:17 ERROR]   task_id=fff40714-… task=emails.send_delivery attempt=4 status=failure error="Request failed: … api.resend.com …"
```

`POST /auth/forgot-password` respondió `200` en 26 ms. Resultado en `GET /email-deliveries?status=failed`:

```json
{"id": "22be8733-…", "idempotency_key": "password_reset:95de8132…", "kind": "password_reset",
 "recipient": "admin@nexova-demo.com", "status": "failed", "attempts": 4,
 "last_error": "ResendError: Request failed: HTTPSConnectionPool(host='api.resend.com', port=443) …",
 "task_id": "fff40714-1681-4795-a4f3-a92dec81fe3e"}
```

Y la misma tarea en la DLQ (`task_dead_letters`: `emails.send_delivery`, 4 intentos). Captura
de Flower: `docs/screenshots/async-processing/flower-tareas.png`.

**No probado aquí:** un envío real correcto, porque necesita una `RESEND_API_KEY` válida y red
hacia Resend. Con la clave de `services/api/.env` y el worker levantado, «¿Olvidaste tu
contraseña?» en el backoffice debe dejar la fila `completed` con `provider_message_id`.

## Archivos

| Pieza | Archivo |
| --- | --- |
| Bandeja de salida (`email_deliveries`) | `services/api/app/services/email_outbox.py` |
| Tarea `emails.send_delivery` y productor `enqueue_password_reset` | `services/api/app/tasks/email.py` |
| Envío con `Idempotency-Key` | `services/api/app/services/email.py` |
| `POST /auth/forgot-password` | `services/api/app/routers/auth.py` |
| `GET /email-deliveries` | `services/api/app/routers/email_deliveries.py` |
| Cola, backoff, DLQ, `GET /tasks/{id}` | los de [DEV-55](./message-queue.md) |
