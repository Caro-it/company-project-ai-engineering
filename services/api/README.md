# Nexova API

API FastAPI centralizada de Nexova.

## Instalación

```powershell
cd services/api
pip install -r requirements.txt
```

## Arranque

```powershell
uvicorn app.main:app --reload --port 8000
```

Documentación interactiva: http://localhost:8000/docs

## Tests

Tests con pytest en `tests/`. `pytest` y `httpx2` (que necesita el `TestClient` de FastAPI) son dependencias de **desarrollo** (`uv add --dev`) y no entran en `requirements.txt`.

```bash
cd services/api
uv run pytest            # o: .venv/Scripts/python -m pytest
```

- TinyDB se sustituye por almacenamiento en memoria en `tests/conftest.py`, antes de importar `app`. Los tests nunca leen ni escriben `data/`, y cada test empieza con las tablas vacías.
- `SECRET_KEY` se fija en los tests: no dependen de `.env`.
- Cobertura:
  - `test_incident_model.py`: valores del CONTEXT, transiciones, mapas CSV → modelo y `csv_row_to_incident`.
  - `test_seed.py`: 96 insertadas y 4 inválidas, totales 27/56/13 y 49/35/12, idempotencia, `ticket_id` solo en `incident_seed_log` y ningún email guardado ni impreso.
  - `test_incidents_api.py`: endpoints, 400 por campo con su `code`, 404, transiciones, 401, 500 genérico con cabeceras CORS y traceback en el log, y el 422 intacto en `/users`, `/auth`, `/profiles` y `/analyze`.

## Endpoints

| Método | Ruta                            | Descripción                                                                       |
| ------ | ------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/health`                   | Comprobación de estado                                                            |
| POST   | `/api/incidents/analyze`        | Recibe un CSV (`multipart/form-data`, campo `file`) y devuelve el resumen en JSON |
| GET    | `/api/incidents/results/export` | Descarga el último análisis como CSV                                              |
| POST   | `/api/incidents`                | Crea una incidencia (siempre en `open`). 201                                      |
| GET    | `/api/incidents`                | Lista, de más reciente a más antigua. Filtros opcionales: `status`, `origin`, `branch`, `category` |
| GET    | `/api/incidents/summary`        | Totales por `status`, `category`, `origin` y `branch`, con todas las claves aunque valgan 0 |
| GET    | `/api/incidents/{incident_id}`  | Detalle de una incidencia                                                         |
| PATCH  | `/api/incidents/{incident_id}/status` | Cambia el estado (body `{"status": ...}`) si la transición está permitida; actualiza `updated_at` |

## Errores

| Código | Caso                                    |
| ------ | --------------------------------------- |
| 400    | Fichero vacío o no UTF-8                |
| 404    | Exportar sin haber analizado antes      |
| 413    | Fichero mayor de 50 MB                  |
| 415    | El fichero no es `.csv`                 |
| 422    | Cabecera incorrecta o CSV sin registros |

Los códigos anteriores son los del analizador (`/analyze` y `/results/export`), que conserva el 422 de FastAPI. Los errores del gestor de incidencias están en la sección siguiente.

La lógica de validación y métricas vive en `packages/shared/incidents_core` y es la misma que usa `scripts/analyze.py`.

### Gestor de incidencias: modelo y seed

Fuente de verdad: `docs/CONTEXT-incident-manager-nexova.md`.

- Valores permitidos (estados, orígenes, categorías y sedes), transiciones y mapas CSV → modelo en `incidents_core/incident_model.py`. Modelos Pydantic en `app/incident_models.py`.
- Persistencia en `data/incidents.json`: tabla `incidents` (id = uuid4 en string) y tabla `incident_seed_log` (`ticket_id` → `incident_id`, para la idempotencia del seed).
- Carga del histórico desde la raíz del repo (es idempotente, se puede repetir):

  ```bash
  services/api/.venv/Scripts/python scripts/seed_incidents.py   # usa scripts/incidents-nexova.csv
  ```

  Resultado esperado con una BD limpia: 100 filas leídas, 96 insertadas y 4 inválidas. La segunda ejecución inserta 0. El informe solo muestra contadores y etiquetas de reglas, nunca datos de los registros.

  Tras el seed, `GET /api/incidents/summary` da: `open` 27, `resolved` 56, `discarded` 13; `technical_failure` 49, `process_error` 35, `client_complaint` 12; `customer` 96; `central` 96.

### Gestor de incidencias: transiciones y errores

Transiciones permitidas (`ALLOWED_TRANSITIONS`): `open → in_progress | discarded` e `in_progress → resolved | discarded`. `resolved` y `discarded` son finales.

Cada error lleva un `code` estable en inglés para que el frontend bilingüe (español e inglés) muestre su propio texto. `detail` y `message` van en español y sirven de respaldo.

| HTTP | `code` | Caso | Campos extra |
| ---- | ------ | ---- | ------------ |
| 400 | `validation_error` | Datos no válidos en el body o en un filtro | `errors` (ver abajo) |
| 400 | `invalid_transition` | Transición no permitida, p. ej. `No se puede pasar de «resolved» a «open»: «resolved» es un estado final` | `from`, `to`, `allowed` (estados a los que sí se puede pasar; `[]` si es final) |
| 401 | — | Sin token o token no válido (respuesta de autenticación de siempre) | — |
| 404 | `not_found` | `Incidencia <id> no encontrada` | — |
| 500 | `internal_error` | `Error interno del servidor`, sin traceback (el traceback queda en el log de uvicorn). Lleva las cabeceras CORS, así que el frontend puede leerlo | — |

Los errores de validación de estas rutas son **400, no 422**, con un error por campo:

```json
{
  "detail": "Datos no válidos",
  "code": "validation_error",
  "errors": [
    {"field": "title", "code": "required", "message": "El título es obligatorio"},
    {"field": "branch", "code": "invalid_choice", "message": "La sede no tiene un valor permitido. Valores válidos: central, valencia_operations, miami_office, remote", "allowed": ["central", "valencia_operations", "miami_office", "remote"]}
  ]
}
```

| `code` de campo | Caso | `field` |
| --------------- | ---- | ------- |
| `required` | Falta un campo obligatorio | el campo |
| `empty_text` | `title` o `description` vacíos o solo con espacios | el campo |
| `invalid_choice` | Valor fuera de los permitidos (`status`, `category`, `origin`, `branch`, también en los filtros). Incluye `allowed` | el campo |
| `extra_field_not_allowed` | Campo que no se puede enviar, p. ej. `status` o `id` en el alta | el campo |
| `invalid_type` | Se esperaba un texto | el campo |
| `invalid_value` | Cualquier otro valor no válido | el campo |
| `invalid_json` | El cuerpo no es un JSON válido | `body` |
| `invalid_body` | El cuerpo no es un objeto JSON | `body` |
| `missing_body` | Falta el cuerpo de la petición | `body` |

El cambio a 400 lo hace `app/errors.py` filtrando por ruta: solo afecta a las rutas del gestor. `/auth`, `/users`, `/profiles`, `/suppliers`, `/analyze` y `/results/export` siguen devolviendo el 422 de FastAPI, del que depende el frontend de AUTH-02. La captura de los 500 sí es global: un middleware HTTP registrado antes de `CORSMiddleware` (en `main.py`, `register_error_handlers(app)` va antes de `add_middleware`), para que la respuesta pase por CORS.

## Inventario (Hito 5 · ticket NXV-0201)

Fuente de verdad: [`docs/CONTEXT-inventory-nexova.md`](../../docs/CONTEXT-inventory-nexova.md).

**Dos bases de datos a la vez** (`app/database.py`):

| Base de datos | Qué guarda | Cómo se usa |
| --- | --- | --- |
| TinyDB (`data/*.json`) | Usuarios, perfiles, tokens, proveedores, incidencias | Tablas TinyDB; `get_current_user` lee aquí al usuario del token |
| Supabase (PostgreSQL) | `asset`, `asset_entry`, `asset_exit` | SQLModel; sesión por petición con `Depends(get_db)` |

No hay tabla de usuarios en Supabase: cada orden guarda en `user_uuid` el id (uuid4) del usuario de TinyDB que la registró, tomado del token (nunca del body).

**Archivos:**

- `app/models.py`: modelos ORM `Asset`, `AssetEntry`, `AssetExit` (`SQLModel, table=True`). FK `asset_id → asset.id` (`ON DELETE RESTRICT`) y restricciones `CHECK` en la BD: catálogos (`category`, `office`, `exit_type`), `quantity > 0` y la regla `allocation ⇒ assigned_to` / `consumption ⇒ assigned_to nulo`. **No hay columna de stock.**
- `app/schemas.py`: schemas Pydantic de request (`*Create`, con `extra="forbid"`: no se puede enviar `current_stock` ni `user_uuid`) y de response (`*Read`, `OrderRead`). Los endpoints solo devuelven estos schemas.
- `app/inventory_catalog.py`: valores permitidos del BRIEFING.
- `app/services/inventory.py`: consultas y reglas de negocio. `app/routers/inventory.py`: `APIRouter(prefix="/inventory")`.
- `app/supplier_models.py`: los modelos Pydantic de proveedores (antes `app/models.py`, renombrado para dejar `models.py` al ORM de inventario, como `auth_models.py` e `incident_models.py`).

**Conexión a Supabase.** En el panel de Supabase: Connect → Direct → *Transaction pooler*, tipo *URI*. Copia la cadena en `DATABASE_URL` de `services/api/.env` (obligatoria: sin ella la API no arranca) y sustituye `[YOUR-PASSWORD]`; si la contraseña tiene caracteres especiales, codifícalos en la URL (`@` → `%40`). La URI se puede pegar tal cual: `app/database.py` fija el driver `psycopg2` (SQLAlchemy 2.1 usaría psycopg 3 por defecto) y no mantiene pool propio (`NullPool`), porque ya lo hace el pooler de Supabase. Al arrancar, la API ejecuta `SQLModel.metadata.create_all(engine)`: crea las tablas que falten y no borra nada.

**Rutas** (todas exigen `Authorization: Bearer <token>`, también los GET):

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/inventory/products` | Activos con `current_stock` calculado. Filtros opcionales: `office`, `category` |
| POST | `/inventory/products` | Registra un activo (201). Empieza con stock 0. 409 si el `sku` ya existe |
| GET | `/inventory/products/{id}` | Un activo con su stock. 404 si no existe |
| POST | `/inventory/orders/inbound` | Registra una entrada (`AssetEntry`): `asset_id`, `quantity`, `supplier`, `office` |
| POST | `/inventory/orders/outbound` | Registra una salida (`AssetExit`): `asset_id`, `quantity`, `exit_type`, `assigned_to`, `office` |
| GET | `/inventory/orders` | Entradas y salidas con los datos del activo y `user_uuid`, más recientes primero. Filtro opcional: `office` |

**Reglas de negocio:**

- `current_stock = SUMA(AssetEntry.quantity) − SUMA(AssetExit.quantity)`, calculado en la consulta. Ninguna ruta permite fijarlo: no hay `PUT`/`PATCH` sobre activos.
- Cada activo pertenece a una oficina (Valencia y Miami tienen SKUs distintos), así que su stock es el de esa oficina. Una orden cuyo `office` no coincide con el del activo se rechaza con 400: el stock de una oficina no se mueve desde la otra.
- Salida mayor que el stock → **400** con el mensaje literal del BRIEFING (`Insufficient stock for asset '{name}'. Available: {available}, requested: {quantity}.`), **antes de escribir nada**. La fila del activo se bloquea con `SELECT … FOR UPDATE`, así dos salidas simultáneas no pueden dejar el stock en negativo.
- `exit_type = "allocation"` sin `assigned_to`, o `"consumption"` con `assigned_to` → 422 de validación (y además lo impide el `CHECK` de la BD).
- `quantity` ≤ 0 → 422. Activo inexistente → 404.
- Sin N+1: `GET /inventory/products` es una sola consulta (subconsultas agregadas de entradas y salidas con `LEFT JOIN`) y `GET /inventory/orders` son dos (una por tabla, cada una con `JOIN asset`), haya los registros que haya.

**Datos semilla** (BRIEFING § Datos Semilla). Necesitan un admin en TinyDB para el `user_uuid` (`uv run create-admin`):

```bash
cd services/api
uv run seed-inventory     # idempotente: activos por SKU; órdenes solo si aún no hay ninguna
```

6 activos, 5 entradas y 3 salidas (2 `allocation`, 1 `consumption`). Stock esperado en `GET /inventory/products`: NXV-IT-001 12 · NXV-IT-002 8 · NXV-PER-001 0 · NXV-PER-002 4 · NXV-OFF-001 16 · NXV-TRN-001 0.

**Tests** (`tests/test_inventory_api.py`, 30 tests): usan SQLite en memoria en lugar de Supabase (nunca la `DATABASE_URL` de `.env`). Para pasarlos contra un PostgreSQL local de pruebas: `TEST_DATABASE_URL=postgresql://… uv run pytest tests/test_inventory_api.py` (borra las tablas de inventario al acabar cada test: **nunca** la BD de Supabase).

## Autenticación

Autenticación JWT stateless (ticket AUTH-01). Los usuarios y sus perfiles se guardan en TinyDB, en `data/auth.json`, separados de los proveedores (`data/suppliers.json`). Las contraseñas se guardan con bcrypt y nunca salen en las respuestas.

### Variables de entorno

Se leen de `services/api/.env` (funciona desde cualquier directorio de arranque). Copia `.env.example` a `.env` y cambia `SECRET_KEY`:

| Variable                      | Obligatoria | Valor por defecto | Descripción                          |
| ----------------------------- | ----------- | ----------------- | ------------------------------------ |
| `SECRET_KEY`                  | Sí          | —                 | Clave con la que se firman los JWT   |
| `DATABASE_URL`                | Sí          | —                 | URI de Supabase (Transaction pooler) para el inventario. Ver "Inventario" |
| `ALGORITHM`                   | No          | `HS256`           | Algoritmo de firma                   |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No          | `30`              | Minutos de validez del token         |
| `RESEND_API_KEY`              | No          | —                 | Clave de [Resend](https://resend.com/api-keys) para enviar el email de recuperación. Sin ella no se envía nada y queda un aviso en los logs |
| `EMAIL_FROM`                  | No          | `Nexova <onboarding@resend.dev>` | Remitente del email. `onboarding@resend.dev` solo entrega al email de tu cuenta de Resend; para otros destinatarios hace falta un dominio verificado |
| `FRONTEND_URL`                | No          | `http://localhost:3001` | URL del backoffice con la que se construye el enlace `/reset-password?token=…` |
| `RESET_TOKEN_EXPIRE_MINUTES`  | No          | `30`              | Minutos de validez del enlace de recuperación |
| `CORS_ORIGINS`                | No          | `["http://localhost:3000","http://localhost:3001"]` | Orígenes permitidos por CORS, como lista JSON |
| `NEXOVA_DATA_DIR`             | No          | `services/api/data` | Carpeta de los archivos de TinyDB. Variable de entorno del proceso (no se lee de `.env`); la usan los tests e2e del backoffice para trabajar con una BD temporal |

Sin `SECRET_KEY` la API no arranca. Para generar una clave aleatoria:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Crear el admin inicial

El alta pública (`POST /users`) siempre crea usuarios con rol `user`. El primer admin se crea por consola:

```powershell
cd services/api
create-admin            # o: python -m app.create_admin
```

Pide el email y la contraseña (dos veces, sin mostrarla). Si el email ya existe, lo promueve a `admin` y lo reactiva sin cambiar su contraseña.

### Flujo en `/docs`

1. Crea un usuario con `POST /users` o un admin con `create-admin`.
2. Pulsa **Authorize**, escribe el email en `username` y la contraseña en `password`. Swagger llama a `POST /auth/login` y guarda el token.
3. Las rutas protegidas (candado) envían ya `Authorization: Bearer <token>`.
4. Comprueba la sesión con `GET /auth/me`.

El token caduca a los `ACCESS_TOKEN_EXPIRE_MINUTES` minutos; después hay que volver a pulsar Authorize. No hay logout en el servidor: basta con descartar el token.

### Rutas públicas y protegidas

| Método   | Ruta                               | Acceso                                           |
| -------- | ---------------------------------- | ------------------------------------------------ |
| GET      | `/api/health`                      | Pública                                          |
| POST     | `/auth/login`                      | Pública (formulario: `username` = email)         |
| POST     | `/users`                           | Pública (alta con rol `user`)                    |
| POST     | `/auth/forgot-password`            | Pública                                          |
| POST     | `/auth/reset-password`             | Pública (requiere el token del email)            |
| POST     | `/auth/change-password`            | Protegida                                        |
| GET      | `/auth/me`                         | Protegida                                        |
| GET      | `/users`                           | Protegida, **solo admin**                        |
| GET      | `/users/{user_id}`                 | Protegida, el propio usuario o admin             |
| PUT      | `/users/{user_id}`                 | Protegida, el propio usuario o admin (*)         |
| DELETE   | `/users/{user_id}`                 | Protegida, el propio usuario o admin             |
| GET, PUT | `/profiles/me`                     | Protegida, solo el propio perfil                 |
| POST     | `/api/incidents/analyze`           | Protegida                                        |
| GET      | `/api/incidents/results/export`    | Protegida                                        |
| GET, POST | `/api/incidents`                  | Protegida                                        |
| GET      | `/api/incidents/summary`           | Protegida                                        |
| GET      | `/api/incidents/{incident_id}`     | Protegida                                        |
| PATCH    | `/api/incidents/{incident_id}/status` | Protegida                                     |
| GET, POST | `/suppliers`                      | Protegida                                        |
| GET, DELETE | `/suppliers/{supplier_id}`      | Protegida                                        |
| PATCH    | `/suppliers/{supplier_id}/rate`    | Protegida                                        |
| PATCH    | `/suppliers/{supplier_id}/status`  | Protegida                                        |

(*) Solo un admin puede cambiar `role` o `is_active`.

### Errores de autenticación

| Código | Caso                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 401    | Sin token, token inválido o caducado, usuario borrado o desactivado, o credenciales incorrectas |
| 403    | El usuario no tiene permiso: no es admin en `GET /users`, accede a otro usuario sin ser admin, o intenta cambiar `role`/`is_active` sin ser admin |
| 400    | `reset-password`: token inexistente, caducado o ya usado. `change-password`: la contraseña actual no es correcta |
| 409    | El email ya está registrado (alta o cambio de email)                                          |
| 422    | Datos no válidos: email incorrecto, contraseña de menos de 8 caracteres o más de 72 bytes, o campos no permitidos |

En las rutas `/users/{user_id}` el permiso se comprueba antes que la existencia: un usuario que no es admin recibe 403 aunque el id no exista, así no puede averiguar qué ids hay. El login responde con el mismo mensaje tanto si el email no existe como si la contraseña es incorrecta.

### Recuperación y cambio de contraseña (AUTH-03)

- `POST /auth/forgot-password` (`{"email": "..."}`) responde **siempre** 200 con `"Si esa dirección está registrada, recibirás un enlace en breve"`. La búsqueda del usuario, el token y el envío se hacen en segundo plano (`BackgroundTasks`), así que ni la respuesta ni su tiempo delatan si el email existe. Si el envío falla, solo queda en los logs (sin el enlace).
- El token es `secrets.token_urlsafe(32)`. En TinyDB (`data/auth.json`, tabla `password_reset_tokens`) solo se guarda su hash sha256, con `expires_at` y `used_at`. Pedir un enlace nuevo invalida los anteriores del mismo usuario. Los usuarios desactivados no reciben enlace.
- El email (HTML y texto) lleva el enlace `{FRONTEND_URL}/reset-password?token=<token>`.
- `POST /auth/reset-password` (`{"token": "...", "new_password": "..."}`) acepta el token una sola vez y antes de que caduque; si no, 400. La nueva contraseña sigue las mismas reglas que el alta (8 caracteres a 72 bytes).
- `POST /auth/change-password` (`{"current_password": "...", "new_password": "..."}`) necesita el token de sesión. Si la contraseña actual no es correcta, 400 (no 401: la sesión sigue siendo válida). Al cambiarla se invalidan los enlaces de recuperación pendientes.

### Limitaciones conocidas

- **Un admin puede quitarse su propio rol o desactivarse** con `PUT /users/{user_id}`, y la API puede quedarse sin ningún admin. Para recuperarlo, ejecuta `create-admin` con su email: lo vuelve a promover a `admin` y lo reactiva.
- Restablecer o cambiar la contraseña **no invalida los JWT ya emitidos**: siguen valiendo hasta que caducan (la API es stateless).
- Los tokens no se pueden revocar antes de que caduquen. Desactivar o borrar un usuario sí invalida sus tokens, porque cada petición comprueba que el usuario exista y esté activo.

### Verificación manual

| # | Prueba | Resultado | Captura |
|---|---|---|---|
| 1 | Rutas en `/docs` (candado = protegida) | — | [01a](../../docs/screenshots/auth-api/01a-docs-overview.png) · [01b](../../docs/screenshots/auth-api/01b-docs-overview.png) |
| 2 | `GET /suppliers` sin token | 401 | [02](../../docs/screenshots/auth-api/02-suppliers-sin-token-401.png) |
| 3 | `POST /users` con email duplicado | 409 | [03](../../docs/screenshots/auth-api/03-registro-duplicado-409.png) |
| 4 | `POST /users` nuevo usuario | 201 | [04](../../docs/screenshots/auth-api/04-registro-201.png) |
| 5 | Login + `GET /auth/me` | 200 | [05](../../docs/screenshots/auth-api/05-auth-me-200.png) |
| 6 | `GET /suppliers` con token | 200 | [06](../../docs/screenshots/auth-api/06-suppliers-con-token-200.png) |
| 7 | `GET /users` como usuario normal | 403 | [07](../../docs/screenshots/auth-api/07-users-no-admin-403.png) |
| 8 | `GET /users/abc` como usuario normal | 403 | [08](../../docs/screenshots/auth-api/08-user-ajeno-403.png) |
| 9 | `GET /users` como admin | 200 | [09](../../docs/screenshots/auth-api/09-users-admin-200.png) |
| 10 | Token mal formado (`curl.exe`) | 401 | [10](../../docs/screenshots/auth-api/10-token-falso-401.png) |
