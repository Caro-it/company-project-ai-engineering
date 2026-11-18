# Auditoría de serialización — API de Nexova (`services/api`)

Rama `feature/serialization-audit`. Alcance: **todos** los endpoints de la app FastAPI centralizada (`services/api/app/main.py` y los seis routers de `services/api/app/routers/`).

## 1. Criterios

Un endpoint está **✅ serializado** cuando cumple todo esto:

1. Lleva `response_model` explícito en el decorador (o, si no devuelve JSON, `response_model=None` con `response_class` y la razón documentada).
2. No devuelve un modelo ORM (SQLModel) ni un `dict` sin tipar: lo que sale está descrito por un esquema Pydantic.
3. Los esquemas de **entrada** (POST/PUT/PATCH) son clases distintas de los de **salida** y rechazan campos que el cliente no debe escribir (`extra="forbid"`).
4. Los **listados** tienen su propio esquema, con solo los campos que usa quien consume, sin reutilizar el de detalle.
5. No expone contraseñas ni hashes, tokens internos ni claves foráneas crudas cuando hay un objeto anidado disponible.
6. Los endpoints de autenticación **sin sesión** (registro, login, forgot-password, reset-password) no devuelven el email. `GET /auth/me` sí puede devolver el email del propio usuario.
7. Cada relación tiene una decisión explícita: objeto anidado, solo el ID o proyección plana.

Leyenda: ✅ serializado · ⚠️ parcial (tiene esquema, pero incumple alguno de los criterios) · ❌ sin serializar (`dict` sin tipar o sin `response_model`).

## 2. Método

- **Inventario de rutas:** generado desde el OpenAPI de la app (`app.openapi()`), no a mano: 32 operaciones. En FastAPI 0.143 `app.routes` agrupa los routers incluidos en `_IncludedRouter`, así que el OpenAPI es la fuente fiable.
- **Qué devuelve de verdad cada ruta:** lectura del router y de su servicio (`app/services/*.py`): si construye el esquema, si devuelve el documento de TinyDB o la fila SQLModel, y qué filtra `response_model`.
- **Qué campos necesita quien consume:** búsqueda de cada ruta en `uis/backoffice/lib/*.ts` y de los campos que leen los componentes (`IncidentsList.tsx`, `SuppliersDirectory.tsx`, `RegisterForm.tsx`, `ProfileForm.tsx`…). El `talent-pipeline-tracker` (carpeta protegida, no se modifica) usa esta API solo para `POST /auth/login` y `GET /auth/me` (`lib/authApi.ts`): lee `access_token` y, de `/auth/me`, `email`, `role` y `profile.{name, phone, address}`. El resto de sus datos vienen de la API de 4Geeks (`services/apiClient.ts`).
- **Persistencia:** usuarios, perfiles, proveedores e incidencias en TinyDB (documentos `dict`); inventario en Supabase/PostgreSQL con SQLModel (`app/models.py`).

## 3. Estado original

Resumen: **32 endpoints · 16 ✅ · 13 ⚠️ · 3 ❌**.

### 3.1 Autenticación (`app/routers/auth.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 1 | POST | `/auth/login` | Login OAuth2 (form `username`/`password`), devuelve el JWT | ✅ | `Token`: `access_token`, `token_type` | — Sin email ni datos del usuario. |
| 2 | GET | `/auth/me` | Datos del usuario de la sesión | ⚠️ | `MeOut`: `email`, `role`, `profile` (`Profile` completo: `id`, `user_id`, `name`, `phone`, `address`) | El perfil anidado arrastra su `id` interno y `user_id`, una clave foránea cruda que apunta al propio usuario que ya es el objeto padre. |
| 3 | POST | `/auth/forgot-password` | Pide el enlace de recuperación | ✅ | `MessageOut`: `message` (siempre el mismo texto) | — |
| 4 | POST | `/auth/reset-password` | Cambia la contraseña con el token del enlace | ✅ | `MessageOut` | — |
| 5 | POST | `/auth/change-password` | Cambia la contraseña con sesión | ✅ | `MessageOut` | — |

### 3.2 Usuarios (`app/routers/users.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 6 | GET | `/users` | Listado de usuarios (solo admin) | ⚠️ | `list[UserOut]`: `id`, `email`, `role`, `is_active`, `created_at` | Reutiliza el esquema de detalle. Ningún consumidor necesita `created_at` en el listado. |
| 7 | POST | `/users` | **Registro** público (sin sesión) | ⚠️ | `UserOut`, **con `email`** | Incumple el criterio 6: un endpoint de auth sin sesión devuelve el email. |
| 8 | GET | `/users/{user_id}` | Detalle (propio usuario o admin) | ✅ | `UserOut` (construido a mano en `_to_user_out`, sin `hashed_password`) | — Con sesión y solo para el dueño o un admin. |
| 9 | PUT | `/users/{user_id}` | Edita email/contraseña; `role` e `is_active` solo admin | ✅ | `UserOut` | — Entrada `UserUpdate` con `extra="forbid"`. |
| 10 | DELETE | `/users/{user_id}` | Borra usuario y perfil | ⚠️ | 204 sin cuerpo (`Response(status_code=204)`) | Sin `response_model` explícito ni `response_class`: que no hay cuerpo no está declarado en el decorador. |

### 3.3 Perfiles (`app/routers/profiles.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 11 | GET | `/profiles/me` | Perfil del usuario de la sesión | ⚠️ | `Profile`: `id`, `user_id`, `name`, `phone`, `address` | Expone el `id` interno del documento y `user_id` (FK cruda al usuario de la sesión, que el cliente ya conoce). El backoffice solo usa `name`, `phone`, `address`. |
| 12 | PUT | `/profiles/me` | Edita el perfil propio | ⚠️ | `Profile` | Igual que el 11. La entrada (`ProfileUpdate`, `extra="forbid"`) sí está bien. |

### 3.4 Incidencias (`app/routers/incidents.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 13 | POST | `/api/incidents/analyze` | Analiza un CSV de tickets (multipart) | ❌ | `dict` sin tipar: `filename`, `summary` (resultado de `analyze_rows`), `invalid_rule_labels` | Sin `response_model`: OpenAPI lo documenta como `object` con `additionalProperties`. |
| 14 | GET | `/api/incidents/results/export` | Descarga el último análisis en CSV | ⚠️ | `Response` `text/csv` con `Content-Disposition` | No es JSON, pero el decorador no lo declara: OpenAPI anuncia un `application/json` vacío. |
| 15 | POST | `/api/incidents` | Alta de incidencia (siempre `open`) | ✅ | Documento de TinyDB (`dict`) validado y filtrado por `response_model=Incident` | — |
| 16 | GET | `/api/incidents` | Listado con filtros | ⚠️ | `list[Incident]` | Reutiliza el esquema de detalle: el listado del backoffice no usa `updated_at`. |
| 17 | GET | `/api/incidents/summary` | Totales por estado, categoría, origen y sede | ❌ | `dict` sin tipar (`total`, `by_status`, `by_category`, `by_origin`, `by_branch`) | Sin `response_model`. |
| 18 | GET | `/api/incidents/{incident_id}` | Detalle | ✅ | `dict` validado por `response_model=Incident` | — |
| 19 | PATCH | `/api/incidents/{incident_id}/status` | Cambia el estado | ✅ | `dict` validado por `response_model=Incident` | — |

### 3.5 Proveedores (`app/routers/suppliers.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 20 | POST | `/suppliers` | Alta de proveedor | ✅ | `Supplier` (todos los campos + `id`, `updated_at`) | — Entrada `SupplierCreate` con `extra="forbid"` (no acepta `id` ni `updated_at`). |
| 21 | GET | `/suppliers` | Listado con filtros `country`, `category` | ⚠️ | `list[Supplier]` | Reutiliza el detalle: la tabla del backoffice no muestra `notes` (texto libre potencialmente largo). |
| 22 | GET | `/suppliers/{supplier_id}` | Detalle | ✅ | `Supplier` | — |
| 23 | DELETE | `/suppliers/{supplier_id}` | Borra y devuelve el proveedor borrado | ✅ | `Supplier` | — |
| 24 | PATCH | `/suppliers/{supplier_id}/rate` | Cambia la tarifa (actualiza `updated_at`) | ✅ | `Supplier` | — Entrada `RateUpdate` (`extra="forbid"`). |
| 25 | PATCH | `/suppliers/{supplier_id}/status` | Activa/suspende | ✅ | `Supplier` | — Entrada `StatusUpdate` (`extra="forbid"`). |

### 3.6 Inventario (`app/routers/inventory.py`, SQLModel)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 26 | GET | `/inventory/products` | Activos con `current_stock` calculado | ⚠️ | `list[AssetRead]` (construido en el servicio, no la tabla) | Reutiliza el esquema de detalle `AssetRead`. |
| 27 | POST | `/inventory/products` | Alta de activo (stock 0) | ✅ | `AssetRead` | — |
| 28 | GET | `/inventory/products/{asset_id}` | Detalle con stock | ✅ | `AssetRead` | — |
| 29 | POST | `/inventory/orders/inbound` | Registra una entrada | ⚠️ | `AssetEntryRead` validado desde la fila SQLModel (`from_attributes`) | Devuelve `asset_id` crudo aunque la relación `AssetEntry.asset` está disponible. |
| 30 | POST | `/inventory/orders/outbound` | Registra una salida | ⚠️ | `AssetExitRead` (igual) | Igual: `asset_id` crudo con la relación `AssetExit.asset` disponible. |
| 31 | GET | `/inventory/orders` | Historial de entradas y salidas | ⚠️ | `list[OrderRead]` con `asset: AssetSummary` (`id`, `name`, `sku`, `category`, `office`) | El activo anidado repite `office` (siempre igual al `office` de la orden, regla del briefing) y `category`, que el historial no necesita. |

### 3.7 Salud (`app/main.py`)

| # | Método | Ruta | Propósito | Estado | Qué devolvía | Problema |
|---|---|---|---|---|---|---|
| 32 | GET | `/api/health` | Comprobación de estado | ❌ | `dict` `{"status": "ok"}` con anotación `-> dict` | Sin `response_model`. |

### 3.8 Entradas

Revisadas todas las clases que reciben datos del cliente:

| Esquema | Endpoint | `extra="forbid"` | Campos que el cliente **no** puede escribir |
|---|---|---|---|
| `UserCreate` | POST `/users` | Sí | `id`, `role` (siempre `user`), `is_active`, `created_at`, `hashed_password` |
| `UserUpdate` | PUT `/users/{id}` | Sí | `id`, `created_at`, `hashed_password`. `role` e `is_active` existen pero el router devuelve 403 si no es admin |
| `ProfileUpdate` | PUT `/profiles/me` | Sí | `id`, `user_id` (el perfil siempre es el de la sesión) |
| `ForgotPasswordRequest`, `ResetPasswordRequest`, `ChangePasswordRequest` | `/auth/*` | Sí | — |
| `OAuth2PasswordRequestForm` | POST `/auth/login` | Formulario estándar | — |
| `IncidentCreate` | POST `/api/incidents` | Sí | `id`, `status` (nace en `open`), `created_at`, `updated_at` |
| `IncidentStatusUpdate` | PATCH `/api/incidents/{id}/status` | Sí | Solo `status`; la transición la valida el servicio |
| `SupplierCreate` | POST `/suppliers` | Sí | `id`, `updated_at` |
| `RateUpdate`, `StatusUpdate` | PATCH `/suppliers/{id}/*` | Sí | Solo su campo |
| `AssetCreate` | POST `/inventory/products` | Sí | `id`, `current_stock` |
| `AssetEntryCreate`, `AssetExitCreate` | POST `/inventory/orders/*` | Sí | `id`, `created_at`, `user_uuid` (sale del token) |
| `UploadFile` | POST `/api/incidents/analyze` | — | Multipart; se valida extensión, tamaño y codificación |

Conclusión: las entradas ya estaban separadas de las salidas y cerradas con `extra="forbid"`. Ningún cliente puede escribir `id`, `role`, `is_active`, `created_at`, `updated_at`, `status` ni `user_uuid` donde no debe. **No requieren cambios**; se añade un test que lo fija (sección 6).

## 4. Campos objetivo y cambio aplicado

Solo se han tocado la capa de esquemas (`auth_models.py`, `supplier_models.py`, `incident_models.py`, `schemas.py`), los decoradores y la construcción de la respuesta en los routers (más el helper `_summary` de `services/inventory.py`, que construye `AssetSummary`). La lógica de negocio y las bases de datos no cambian. Commit de cada bloque entre paréntesis.

### 4.1 Autenticación, usuarios y perfiles (`f9db6a3`)

| # | Endpoint | Esquema de salida | Campos objetivo | Cambio aplicado |
|---|---|---|---|---|
| 1 | POST `/auth/login` | `Token` | `access_token`, `token_type` | Ninguno. |
| 2 | GET `/auth/me` | `MeOut` | `email`, `role`, `profile` → `ProfileOut` (`name`, `phone`, `address`) | El perfil anidado pasa de `Profile` a `ProfileOut`: sin `id` interno ni `user_id`. El email se mantiene: es el propio usuario y hay sesión. |
| 3–5 | POST `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` | `MessageOut` | `message` | Ninguno. |
| 6 | GET `/users` | **`UserListItem`** (nuevo) | `id`, `email`, `role`, `is_active` | Esquema de lista propio, sin `created_at`. Solo admin: el email hace falta para identificar cada cuenta. |
| 7 | POST `/users` | **`RegisterOut`** (nuevo) | `id`, `role`, `created_at` | Ya no devuelve el email. El backoffice (`registerUser`) ignora el cuerpo y hace login con lo que escribió la usuaria, así que no hubo que adaptarlo. |
| 8–9 | GET / PUT `/users/{id}` | `UserOut` | `id`, `email`, `role`, `is_active`, `created_at` | Ninguno (detalle con sesión, solo dueño o admin). |
| 10 | DELETE `/users/{id}` | — | Sin cuerpo | `status_code=204, response_model=None, response_class=Response` en el decorador: OpenAPI documenta el 204 sin contenido. |
| 11–12 | GET / PUT `/profiles/me` | **`ProfileOut`** (nuevo, sustituye a `Profile`) | `name`, `phone`, `address` | Sin `id` ni `user_id`. Es exactamente lo que usan el backoffice (`ProfileData`) y el tracker (`Me.profile`). |

### 4.2 Proveedores (`a1a04cb`)

| # | Endpoint | Esquema de salida | Campos objetivo | Cambio aplicado |
|---|---|---|---|---|
| 20, 22–25 | POST, GET `/{id}`, DELETE, PATCH `/rate`, PATCH `/status` | `Supplier` | Todos: `id`, `name`, `country`, `categories`, `monthly_rate`, `currency`, `status`, `contract_renewal_date`, `contact_email`, `notes`, `updated_at` | Ninguno. |
| 21 | GET `/suppliers` | **`SupplierListItem`** (nuevo) | Los del detalle **sin `notes`** | Esquema de lista propio. Es lo que pinta la tabla de `SuppliersDirectory.tsx` (nombre, email de contacto, país, categorías, tarifa, moneda, fecha de tarifa, renovación, estado). Backoffice: tipo `SupplierListItem = Omit<Supplier, "notes">` en `lib/suppliers.ts` y en el componente. |

### 4.3 Incidencias (`8655737`)

| # | Endpoint | Esquema de salida | Campos objetivo | Cambio aplicado |
|---|---|---|---|---|
| 13 | POST `/api/incidents/analyze` | **`AnalyzeOut`** (nuevo) | `filename`, `summary` (`AnalysisSummary`: `total_records`, `valid_records`, `invalid_records`, `invalid_by_rule`, `by_category`, `by_status`, `satisfaction` → `SatisfactionStats`: `closed`, `scored`, `average`, `distribution`), `invalid_rule_labels` | `response_model=AnalyzeOut`; el router construye el modelo en lugar del `dict`. Los desgloses son `dict[str, int]` porque sus claves son los catálogos de `incidents_core` (`RULES`, `VALID_CATEGORIES`, `VALID_STATUSES`). Misma forma que `AnalyzeResponse` del backoffice. |
| 14 | GET `/api/incidents/results/export` | — | Fichero CSV | `response_model=None`, `response_class=Response` y `responses={200: {"content": {"text/csv": {}}}}`. **No lleva `response_model` porque no devuelve JSON**: es un fichero para descargar. |
| 15, 18, 19 | POST, GET `/{id}`, PATCH `/{id}/status` | `Incident` | `id`, `title`, `description`, `category`, `origin`, `branch`, `status`, `created_at`, `updated_at` | El router construye `Incident.model_validate(doc)` en vez de devolver el documento de TinyDB y dejar el filtrado a FastAPI. |
| 16 | GET `/api/incidents` | **`IncidentListItem`** (nuevo) | Los del detalle **sin `updated_at`** | Esquema de lista propio. `IncidentsList.tsx` usa todos los demás (la descripción se pinta bajo el título). Backoffice: `IncidentListItem = Omit<Incident, "updated_at">`. |
| 17 | GET `/api/incidents/summary` | **`IncidentStats`** (nuevo) | `total`, `by_status`, `by_category`, `by_origin`, `by_branch` | Los desgloses se tipan con los `Literal` del catálogo (`dict[Status, int]`…), así OpenAPI documenta qué claves trae. |

### 4.4 Inventario (`d90af92`)

| # | Endpoint | Esquema de salida | Campos objetivo | Cambio aplicado |
|---|---|---|---|---|
| 26 | GET `/inventory/products` | **`AssetListItem`** (nuevo) | `id`, `name`, `sku`, `category`, `office`, `current_stock` | Clase propia. **Coincide en campos con el detalle `AssetRead`, y es deliberado:** el activo no tiene más datos y todos hacen falta en el listado (`current_stock` es su razón de ser y el evaluador del briefing lo comprueba aquí; `office` lo exige el briefing en las respuestas; `category` y `office` son los filtros). Separarlo evita que, si el detalle crece, el listado lo herede. |
| 27–28 | POST `/products`, GET `/products/{id}` | `AssetRead` | Igual que arriba | Ninguno. |
| 29 | POST `/orders/inbound` | `AssetEntryRead` | `id`, **`asset`** (`AssetSummary`), `quantity`, `supplier`, `office`, `created_at`, `user_uuid` | `asset_id` crudo → objeto anidado `asset`. Se sigue validando desde la fila SQLModel con `from_attributes`, dentro de la sesión: la tabla nunca se devuelve tal cual. |
| 30 | POST `/orders/outbound` | `AssetExitRead` | `id`, **`asset`**, `quantity`, `exit_type`, `assigned_to`, `office`, `created_at`, `user_uuid` | Igual que el 29. |
| 31 | GET `/orders` | `OrderRead` | `order_type`, `id`, `asset` (`id`, `name`, `sku`), `quantity`, `office`, `created_at`, `user_uuid`, `supplier` / `exit_type` / `assigned_to` | `AssetSummary` pierde `office` (siempre es la de la orden) y `category`. |

El backoffice no consume inventario (no tiene pantalla), así que estos cambios no afectan a ningún frontend.

### 4.5 Salud (`e3c797d`)

| # | Endpoint | Esquema de salida | Campos objetivo | Cambio aplicado |
|---|---|---|---|---|
| 32 | GET `/api/health` | **`HealthOut`** (nuevo) | `status: "ok"` | `response_model=HealthOut`. |

## 5. Decisiones sobre relaciones

| Relación | Dónde aparece | Decisión | Motivo |
|---|---|---|---|
| Usuario → Perfil | `GET /auth/me` | **Objeto anidado** (`profile: ProfileOut \| null`) | Quien pide `/me` quiere sus datos personales en la misma llamada (backoffice y tracker los pintan). Sin `id` ni `user_id`: el padre ya es el usuario. |
| Perfil → Usuario | `GET/PUT /profiles/me` | **Ninguna** (ni objeto ni ID) | Siempre es el usuario de la sesión: `user_id` no aporta nada y era una FK cruda. |
| Orden → Activo | `POST /orders/inbound`, `POST /orders/outbound`, `GET /orders` | **Objeto anidado reducido** (`AssetSummary`: `id`, `name`, `sku`) | La relación SQLModel (`AssetEntry.asset`, `AssetExit.asset`) está disponible, así que no se devuelve el `asset_id` crudo. Basta con lo que identifica el activo: `office` ya está en la orden y el stock no se anida (cambia con cada orden y tiene su endpoint). |
| Orden → Usuario que la registró | `user_uuid` en órdenes | **Solo el ID** | El usuario vive en TinyDB y el inventario en Supabase, sin FK (regla 4 del briefing). No hay objeto que anidar sin una consulta entre bases, que sería lógica nueva. El briefing pide `user_uuid` en el contrato. |
| Activo → Órdenes | `GET /products`, `GET /products/{id}` | **Proyección plana** (`current_stock`) | No se anidan las listas `entries`/`exits` (crecen sin límite): se devuelve el agregado calculado. |
| Proveedor → Categorías | `Supplier`, `SupplierListItem` | **Lista de valores** (`categories: list[Category]`) | Son un catálogo cerrado, no entidades. |
| Incidencia → Catálogos (categoría, origen, sede, estado) | `Incident`, `IncidentListItem` | **Valores planos** | Ídem: enums, no relaciones. |
| Token de recuperación → Usuario | Solo interno (`password_reset_tokens`) | **No se expone** | Ningún endpoint devuelve tokens de recuperación: solo viajan en el enlace del email. |

## 6. Tests

`services/api/tests/test_serialization.py` (19 casos, commit `fe19824`):

- `POST /users`, `POST /auth/login`, `POST /auth/forgot-password` y `POST /auth/reset-password` no devuelven `email`, `password`, `hashed_password` ni `new_password`. El registro devuelve exactamente `{id, role, created_at}`.
- `GET /auth/me` sí devuelve `email`, y su `profile` solo `{name, phone, address}`.
- Listados con el conjunto exacto de campos de su esquema: `GET /suppliers` (sin `notes`), `GET /users` (admin) y `GET /api/incidents` (sin `updated_at`).
- `POST /inventory/orders/inbound` devuelve `asset` anidado y no `asset_id`.
- Entradas con campos no permitidos (`is_active` y `created_at` en `/users`; `id` y `updated_at` en `/suppliers`) → **422** `extra_forbidden`.
- Ninguna operación del OpenAPI con cuerpo JSON queda sin `$ref` a un esquema (salvo las dos rutas sin cuerpo JSON de la sección 4), y el export se documenta como `text/csv`.

Tests existentes adaptados al nuevo contrato (misma intención, nueva forma): `test_token.py` y `test_profiles_api.py` comprobaban `profile.user_id`; ahora comprueban el perfil exacto sin IDs. `test_incidents_api.py::test_list_after_seed_never_exposes_emails` fija los campos del listado, ahora sin `updated_at`.

| Suite | Resultado |
|---|---|
| `uv run pytest` (`services/api`) | **167 passed** (148 previos + 19 nuevos) |
| `uv run pytest --cov` (módulo de auth) | 95 % |
| Backoffice `npm run lint` | Sin errores |
| Backoffice Jest | 51/51 |
| Backoffice `npm run build` | OK |
| Backoffice e2e Playwright | 16/16 (con `DATABASE_URL=sqlite://` para no conectar con Supabase) |

## 7. Verificación manual de respuestas

**Se hizo con `curl` en lugar de `/docs`** porque la tarea se ejecutó sin nadie delante del navegador. La API se arrancó con `uvicorn` (puerto 8010) y datos aislados: `NEXOVA_DATA_DIR` apuntando a una carpeta temporal vacía (no se tocó `services/api/data/`) y `DATABASE_URL` a un SQLite local en lugar de Supabase, para no escribir en la base real. El token se ha sustituido por `<redactado>`.

**Auth sin sesión — `POST /users` (registro).** Coincide con `RegisterOut`: sin email.

```json
HTTP 201
{
  "id": "f43040f8-3386-4845-b906-d72b5eb987d8",
  "role": "user",
  "created_at": "2026-11-18T00:05:11.907619Z"
}
```

**`POST /auth/login`.** Coincide con `Token`.

```json
{ "access_token": "<redactado>", "token_type": "bearer" }
```

**Auth con sesión — `GET /auth/me`.** Coincide con `MeOut` + `ProfileOut`: email propio y perfil sin IDs.

```json
HTTP 200
{
  "email": "verificacion.manual@example.com",
  "role": "user",
  "profile": { "name": "Ana Prueba", "phone": null, "address": null }
}
```

**Listado — `GET /suppliers`** (tras crear un proveedor con `notes`). Coincide con `SupplierListItem`: `notes` no aparece, aunque el `POST` sí lo devolvió.

```json
HTTP 200
[
  {
    "id": 1,
    "name": "Portal Empleo QA",
    "country": "Spain",
    "categories": ["job_boards"],
    "monthly_rate": 450.0,
    "currency": "EUR",
    "status": "active",
    "contract_renewal_date": "2027-03-31",
    "contact_email": "comercial@portal-qa.example",
    "updated_at": "2026-11-18T00:05:13.977723Z"
  }
]
```

**Escritura — `PATCH /suppliers/1/rate`.** Coincide con `Supplier` (detalle completo, `updated_at` actualizado).

```json
HTTP 200
{
  "name": "Portal Empleo QA", "country": "Spain", "categories": ["job_boards"],
  "monthly_rate": 480.0, "currency": "EUR", "status": "active",
  "contract_renewal_date": "2027-03-31", "contact_email": "comercial@portal-qa.example",
  "notes": "Contrato anual con revision trimestral",
  "id": 1, "updated_at": "2026-11-18T00:05:14.855462Z"
}
```

**Entrada con campo no permitido — `POST /suppliers` con `"id": 7`.**

```json
HTTP 422
{ "detail": [ { "loc": ["body", "id"], "msg": "Extra inputs are not permitted", "type": "extra_forbidden" } ] }
```

**Listado — `GET /api/incidents`** (tras un `POST`, que sí devolvió `updated_at`). Coincide con `IncidentListItem`.

```json
HTTP 200
[
  {
    "id": "6997b491-7462-45b3-a4b9-eacf79a7e133",
    "title": "Error en la exportacion",
    "description": "El CSV sale vacio",
    "category": "technical_failure",
    "origin": "internal",
    "branch": "central",
    "status": "open",
    "created_at": "2026-11-18T00:05:15.697027Z"
  }
]
```

`GET /api/incidents/summary` coincide con `IncidentStats`, con todas las claves aunque valgan 0: `{"total": 1, "by_status": {"open": 1, "in_progress": 0, "resolved": 0, "discarded": 0}, "by_category": {"technical_failure": 1, …}, "by_origin": {…}, "by_branch": {…}}`. `GET /api/health` → `{"status": "ok"}`.

**Inventario — `POST /inventory/orders/inbound`** contra el SQLite local (mismo código y misma capa SQLModel, **no** Supabase). Coincide con `AssetEntryRead`: `asset` anidado, sin `asset_id`.

```json
HTTP 201
{
  "id": 1,
  "asset": { "id": 1, "name": "Hub USB-C", "sku": "NXV-PER-101" },
  "quantity": 3,
  "supplier": "Office Depot Miami",
  "office": "Miami",
  "created_at": "2026-11-18T00:05:25.618289",
  "user_uuid": "f43040f8-3386-4845-b906-d72b5eb987d8"
}
```

Después, `GET /inventory/products` devolvió el activo con `current_stock: 3` y los campos de `AssetListItem`.

**Limitación:** el inventario no se probó contra Supabase, a propósito: habría escrito datos de prueba en la base real. Lo cubren los tests (SQLite en memoria, como el resto de la suite) y la llamada anterior.

## 8. Antes / después

| # | Método | Ruta | Antes | Después | Esquema de salida final |
|---|---|---|---|---|---|
| 1 | POST | `/auth/login` | ✅ | ✅ | `Token` |
| 2 | GET | `/auth/me` | ⚠️ | ✅ | `MeOut` (+ `ProfileOut`) |
| 3 | POST | `/auth/forgot-password` | ✅ | ✅ | `MessageOut` |
| 4 | POST | `/auth/reset-password` | ✅ | ✅ | `MessageOut` |
| 5 | POST | `/auth/change-password` | ✅ | ✅ | `MessageOut` |
| 6 | GET | `/users` | ⚠️ | ✅ | `list[UserListItem]` |
| 7 | POST | `/users` | ⚠️ | ✅ | `RegisterOut` |
| 8 | GET | `/users/{user_id}` | ✅ | ✅ | `UserOut` |
| 9 | PUT | `/users/{user_id}` | ✅ | ✅ | `UserOut` |
| 10 | DELETE | `/users/{user_id}` | ⚠️ | ✅ | 204 sin cuerpo (`response_model=None`) |
| 11 | GET | `/profiles/me` | ⚠️ | ✅ | `ProfileOut` |
| 12 | PUT | `/profiles/me` | ⚠️ | ✅ | `ProfileOut` |
| 13 | POST | `/api/incidents/analyze` | ❌ | ✅ | `AnalyzeOut` |
| 14 | GET | `/api/incidents/results/export` | ⚠️ | ✅ | Fichero `text/csv` (`response_model=None`) |
| 15 | POST | `/api/incidents` | ✅ | ✅ | `Incident` |
| 16 | GET | `/api/incidents` | ⚠️ | ✅ | `list[IncidentListItem]` |
| 17 | GET | `/api/incidents/summary` | ❌ | ✅ | `IncidentStats` |
| 18 | GET | `/api/incidents/{incident_id}` | ✅ | ✅ | `Incident` |
| 19 | PATCH | `/api/incidents/{incident_id}/status` | ✅ | ✅ | `Incident` |
| 20 | POST | `/suppliers` | ✅ | ✅ | `Supplier` |
| 21 | GET | `/suppliers` | ⚠️ | ✅ | `list[SupplierListItem]` |
| 22 | GET | `/suppliers/{supplier_id}` | ✅ | ✅ | `Supplier` |
| 23 | DELETE | `/suppliers/{supplier_id}` | ✅ | ✅ | `Supplier` |
| 24 | PATCH | `/suppliers/{supplier_id}/rate` | ✅ | ✅ | `Supplier` |
| 25 | PATCH | `/suppliers/{supplier_id}/status` | ✅ | ✅ | `Supplier` |
| 26 | GET | `/inventory/products` | ⚠️ | ✅ | `list[AssetListItem]` |
| 27 | POST | `/inventory/products` | ✅ | ✅ | `AssetRead` |
| 28 | GET | `/inventory/products/{asset_id}` | ✅ | ✅ | `AssetRead` |
| 29 | POST | `/inventory/orders/inbound` | ⚠️ | ✅ | `AssetEntryRead` (+ `AssetSummary`) |
| 30 | POST | `/inventory/orders/outbound` | ⚠️ | ✅ | `AssetExitRead` (+ `AssetSummary`) |
| 31 | GET | `/inventory/orders` | ⚠️ | ✅ | `list[OrderRead]` (+ `AssetSummary`) |
| 32 | GET | `/api/health` | ❌ | ✅ | `HealthOut` |

**Total: antes 16 ✅ · 13 ⚠️ · 3 ❌ → después 32 ✅.**

### Cambios de contrato para quien consume la API

- `POST /users` ya no devuelve `email`, `is_active` ni ningún dato que el cliente no tuviera.
- `/profiles/me` y el `profile` de `/auth/me` ya no llevan `id` ni `user_id`.
- `GET /users`: sin `created_at`. `GET /suppliers`: sin `notes`. `GET /api/incidents`: sin `updated_at`.
- Órdenes de inventario: `asset_id` → `asset: {id, name, sku}`. En `GET /orders`, `asset` ya no lleva `category` ni `office`.

El backoffice se adaptó en la misma rama (tipos `SupplierListItem` e `IncidentListItem`). El tracker no necesita cambios: solo lee `profile.{name, phone, address}`.
