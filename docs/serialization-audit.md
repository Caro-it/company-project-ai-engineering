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
