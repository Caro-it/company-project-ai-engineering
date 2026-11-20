# Plan de Telemetría — Nexova Solutions

> Respuesta al RFI de gestión: qué datos captura el sistema, por qué, con qué forma y cómo se entregan.
> Este documento es de **diseño**: no hay instrumentación todavía. Está pensado para que otro
> desarrollador lo implemente sin tener que preguntar nada.
>
> - **BRIEFING:** [`docs/CONTEXT-telemetry-nexova.md`](../CONTEXT-telemetry-nexova.md) (copia del `nexova-BRIEFING` de telemetría).
> - **Esquemas validables:** [`event-schemas.json`](./event-schemas.json) (JSON Schema draft-07). Tiene exactamente los mismos eventos, propiedades y enums que este documento.
> - **Versión del plan:** 1.0.0 · todos los esquemas en `schemaVersion` 1.0.0.

## Resumen

- **32 eventos**: **5 obligatorios** del BRIEFING y **27 identificados** en el resto de la aplicación.
- **Grupos:** inventario (10) · autenticación (8) · rendimiento (3) · errores (4) · navegación (3) · negocio (4).
- **Entrega:** 9 en stream (alertas que necesitan una reacción en minutos) y 23 en batch.
- **Quién emite:** 12 desde la API (todo lo que cambia datos o depende de una regla de negocio) y 20 desde el frontend (navegación, rendimiento percibido y errores que la API no ve).
- **Regla de oro aplicada a todos:** cada evento tiene su frase *«Capturamos X porque necesitamos saber Y, lo que nos permite Z»* (§4.1). Lo que no tuvo frase está en §7 como descartado.

---

## 1. Contexto y alcance

### 1.1 Qué pide el BRIEFING

Nexova gestiona un inventario de **material de formación y certificación** (Elena, L&D) y de
**kits de incorporación** (Patricia, RRHH), en dos oficinas: Valencia y Miami. Las métricas
obligatorias se agregarán **por oficina y por programa** en el dashboard de L&D de Elena y en el
reporte ejecutivo semanal de Laura, así que todos los eventos de inventario llevan `office` y
`programme_id`.

Campos mínimos del BRIEFING en `properties` de los eventos de inventario, con estos nombres y valores
exactos: `office` (`valencia`/`miami`), `product_id`, `product_category`
(`training_kit`/`certification`/`onboarding_equipment`), `programme_id`, `quantity`,
`currency` (`EUR`/`USD`).

Restricciones que el plan respeta:

- Montos en la moneda de la oficina (EUR Valencia, USD Miami). **La telemetría nunca convierte monedas.**
- El stock solo cambia con una orden de entrada o salida trazable a un usuario.
- El idioma de la interfaz y la oficina son dimensiones independientes: `ui_locale` y `office` van por separado.
- Ningún nombre de candidato, cliente ni consultor en `properties`.

### 1.2 Entidades: BRIEFING ↔ sistema actual

| BRIEFING | En el monorepo hoy | Nota |
| --- | --- | --- |
| `Product` | tabla `asset` (`Asset`) | `product_id` = `asset.id` como texto |
| `InboundOrder` | tabla `asset_entry` | `POST /inventory/orders/inbound` |
| `OutboundOrder` | tabla `asset_exit` | `POST /inventory/orders/outbound` |
| `office` | `Office`: `Valencia` / `Miami` | en telemetría se emite en minúsculas: `valencia` / `miami` |
| `programme` | — | no existe todavía |

### 1.3 Brecha entre el BRIEFING y el sistema actual

El inventario del Hito 5 se diseñó con otro BRIEFING (activos de oficina). Para emitir las métricas
obligatorias **tal como las define este BRIEFING**, el proyecto de captura tiene que añadir antes
estos datos. Se listan aquí para que nadie instrumente sobre campos que no existen.

> **Estado:** resuelto en la rama `feature/telemetry-capture`. Los modelos ya tienen estos
> campos y en Supabase los añade `uv run migrate-telemetry` (desde `services/api`;
> `--dry-run` muestra el SQL). Los activos existentes se rellenan con
> `programme_id` = `formacion-general` (material de formación) u `onboarding-general` (resto).


| Falta | Para qué evento | Propuesta |
| --- | --- | --- |
| `programme_id` en `asset` | todos los de inventario | columna `programme_id` (slug, ej. `ventas-b2b`), obligatoria en el alta |
| Categorías del BRIEFING | todos los de inventario | columna nueva `product_category` (`training_kit`/`certification`/`onboarding_equipment`), **independiente** de `category` (tipo de activo del Hito 5: un portátil es `hardware` como activo y `onboarding_equipment` como material). Relleno inicial de los activos existentes: `training_materials` → `training_kit`; el resto → `onboarding_equipment`. **Pendiente de confirmar con el mentor**; se corrige activo por activo |
| `unit_cost` y `currency` en `asset_entry` | `inbound_order_created`, `kit_cost_variance_detected` | columnas en la orden de entrada; `currency` se deriva de la oficina, no la elige el usuario |
| `min_stock` por producto | `stock_threshold_triggered` | columna con valor por defecto 5 (el `LOW_STOCK_MAX` que ya usa el backoffice en `lib/inventory.ts`, PR #14) |
| `recipient_type` en `asset_exit` | `outbound_order_created` | a quién se entrega como tipo (`client`, `candidate`, `consultant`, `support_agent`, `employee`); el nombre (`assigned_to`) nunca sale en telemetría |
| Proveedor normalizado | `inbound_order_created`, `kit_cost_variance_detected` | hoy `supplier` es texto libre; se emite `supplier_id` = slug del nombre (`TechDistrib Valencia S.L.` → `techdistrib-valencia-sl`) hasta que las entradas apunten al directorio de proveedores |

---

## 2. Flujo de inventario y puntos de instrumentación

Recorrido de un operador desde que entra hasta que registra una orden. Cada paso indica qué evento
emite y dónde.

| # | Paso del flujo | Evento(s) | Dónde |
| --- | --- | --- | --- |
| 1 | Login en el backoffice | `login_succeeded` / `login_failed` | backoffice, formulario de login |
| 2 | Abre Inventario → Productos | `page_viewed`, `page_load_recorded` | backoffice `/inventory/products` |
| 3 | Intenta fijar el stock a mano («Ajustar stock») | `direct_stock_edit_rejected` | backoffice, tras el 405/422 de la API |
| 4 | Abre el formulario de entrada o salida y lo deja a medias | `order_form_abandoned` | backoffice `/inventory/orders/inbound` y `/outbound` |
| 5 | Envía con errores de cliente | `order_form_validation_failed` | backoffice |
| 6 | La API rechaza la orden | `inbound_order_rejected` / `outbound_order_rejected` | backoffice, con el status de la API |
| 7 | La API registra la orden | `inbound_order_created` / `outbound_order_created` | backoffice, tras el 201 (commit hecho) |
| 8 | La entrada sale más cara de lo habitual | `kit_cost_variance_detected` | backoffice, con `cost_baseline` de la respuesta |
| 9 | La salida deja el stock bajo el mínimo / a cero | `stock_threshold_triggered` / `stock_depleted` | backoffice, con `stock_after` y `min_stock` de la respuesta |
| 10 | Caduca el token a mitad de la tarea | `session_expired` | backoffice |
| — | En todo momento | `frontend_error_captured`, `api_request_failed` (backoffice); `api_latency_recorded`, `api_error_occurred` (API) | backoffice y API |

**Quién emite y con qué datos.** El proyecto de captura pide que todo el tracking del
backoffice pase por una única función `track()`. Para no contar operaciones que no existen,
los eventos de negocio se emiten **solo después de la respuesta 2xx de la API** (la orden ya
está guardada) y **con los datos que devuelve la API**: `stock_after`, `min_stock` y
`cost_baseline` los calcula la API en la respuesta de cada orden; el navegador no calcula el
stock por su cuenta. Un fallo de red después del clic no genera `outbound_order_created`,
sino `api_request_failed`. Los eventos que solo la API puede ver (latencia agregada, 5xx,
403, cambios de rol, restablecimiento de contraseña) siguen marcados como emitidos por la
API: se instrumentan en la fase de almacenamiento.

---

## 3. Event Envelope

### 3.1 Campos

Todo evento, venga de donde venga, es un objeto con **exactamente** estos campos (`additionalProperties: false`):

| Campo | Tipo | Obligatorio | Regla |
| --- | --- | --- | --- |
| `eventId` | string (UUID v4) | sí | Lo genera quien emite. Sirve para deduplicar reintentos: el almacenamiento ignora un `eventId` repetido. |
| `timestamp` | string ISO 8601, UTC con `Z` | sí | Momento del **hecho**, no del envío. Ej. `2026-11-18T19:30:05.123Z`. Nunca hora local. |
| `sessionId` | string (UUID) o `null` | sí | UUID por pestaña en `sessionStorage`; rota tras 30 min sin actividad. Viaja a la API en `X-Session-ID`. `null` en procesos sin navegador (`source: job`). |
| `userId` | string (UUID) o `null` | sí | `users.id` interno. **Nunca** email ni nombre. `null` si no hay usuario autenticado (login fallido, web pública). |
| `event_type` | string | sí | `entidad_acción` en snake_case, verbo en participio: `created`, `rejected`, `triggered`, `detected`, `succeeded`, `failed`, `expired`, `recorded`, `captured`, `viewed`, `applied`, `abandoned`, `changed`, `requested`, `completed`, `denied`, `analyzed`, `depleted`, `occurred`. |
| `schemaVersion` | string semver | sí | Versión del esquema de **ese** `event_type` (ver §8). |
| `requestId` | string (UUID) o `null` | sí | Correlación frontend–API–logs. El cliente HTTP del backoffice genera un UUID por llamada y lo manda en `X-Request-ID`; la API lo reutiliza (o crea uno si falta), lo devuelve en la respuesta y lo escribe en el log `api.timing`. `null` en eventos sin petición. |
| `source` | `backoffice` \| `website` \| `api` \| `job` | sí | Quién emite. |
| `environment` | `development` \| `production` | sí | Para no mezclar pruebas con datos reales. |
| `properties` | object | sí | Payload del evento. Solo las claves de su allowlist (§4.2). |

Ejemplo completo:

```json
{
  "eventId": "7f3c2a8e-9b1d-4c6e-8a2f-1d5e9b7c3a40",
  "timestamp": "2026-11-18T09:42:17.381Z",
  "sessionId": "c1a9e5d2-4b7f-4e3a-9c8d-2f6b1a0e7d54",
  "userId": "5b2e8f1c-3d4a-4f6b-9e7c-8a1d2c3b4e5f",
  "event_type": "stock_threshold_triggered",
  "schemaVersion": "1.0.0",
  "requestId": "e4d3c2b1-a098-4f76-8e5d-4c3b2a1f0e9d",
  "source": "api",
  "environment": "production",
  "properties": {
    "office": "valencia",
    "product_id": "42",
    "product_category": "training_kit",
    "programme_id": "ventas-b2b",
    "quantity": 3,
    "currency": "EUR",
    "min_stock": 5,
    "stock_before": 6,
    "stock_after": 3,
    "trigger_order_id": "1187"
  }
}
```

### 3.2 Reglas comunes

- **Emitir después del commit.** Un evento de negocio de la API se emite solo cuando la transacción se
  ha confirmado. Si el emisor de telemetría falla, la petición del usuario **no** falla: la
  telemetría nunca bloquea una operación.
- **Allowlist estricta.** El emisor construye `properties` copiando solo las claves del esquema; nunca
  hace `properties = body` ni `model_dump()` del objeto completo. El almacenamiento valida contra
  `event-schemas.json` y rechaza cualquier clave extra.
- **Rutas como plantilla.** `route` y `page` van sin ids, query ni hash: `/inventory/products/{id}`,
  nunca `/inventory/products/42?office=Valencia`.
- **Valores normalizados.** Enums en minúsculas y en inglés (`valencia`, `training_kit`), aunque la
  interfaz esté en español. Los textos que se muestran al usuario no son telemetría.
- **Ids como texto.** `product_id`, `order_id`, etc. son strings aunque hoy sean enteros, para que el
  esquema sobreviva a un cambio a UUID.

---

## 4. Catálogo de eventos

### 4.1 Resumen y regla de oro

| # | `event_type` | Grupo | Origen | Emite | Entrega |
| --- | --- | --- | --- | --- | --- |
| 1 | [`inbound_order_created`](#inbound_order_created) | inventario | **Obligatorio** | Frontend (backoffice / web) | batch |
| 2 | [`outbound_order_created`](#outbound_order_created) | inventario | **Obligatorio** | Frontend (backoffice / web) | batch |
| 3 | [`stock_threshold_triggered`](#stock_threshold_triggered) | inventario | **Obligatorio** | Frontend (backoffice / web) | stream |
| 4 | [`direct_stock_edit_rejected`](#direct_stock_edit_rejected) | inventario | **Obligatorio** | Frontend (backoffice / web) | stream |
| 5 | [`kit_cost_variance_detected`](#kit_cost_variance_detected) | inventario | **Obligatorio** | Frontend (backoffice / web) | stream |
| 6 | [`inbound_order_rejected`](#inbound_order_rejected) | inventario | Identificado | Frontend (backoffice / web) | batch |
| 7 | [`outbound_order_rejected`](#outbound_order_rejected) | inventario | Identificado | Frontend (backoffice / web) | batch |
| 8 | [`stock_depleted`](#stock_depleted) | inventario | Identificado | Frontend (backoffice / web) | stream |
| 9 | [`product_created`](#product_created) | inventario | Identificado | API (FastAPI) | batch |
| 10 | [`product_create_rejected`](#product_create_rejected) | inventario | Identificado | API (FastAPI) | batch |
| 11 | [`login_succeeded`](#login_succeeded) | autenticación | Identificado | Frontend (backoffice / web) | batch |
| 12 | [`login_failed`](#login_failed) | autenticación | Identificado | Frontend (backoffice / web) | stream |
| 13 | [`session_expired`](#session_expired) | autenticación | Identificado | Frontend (backoffice / web) | batch |
| 14 | [`password_reset_requested`](#password_reset_requested) | autenticación | Identificado | API (FastAPI) | batch |
| 15 | [`password_reset_completed`](#password_reset_completed) | autenticación | Identificado | API (FastAPI) | batch |
| 16 | [`password_reset_failed`](#password_reset_failed) | autenticación | Identificado | API (FastAPI) | batch |
| 17 | [`permission_denied`](#permission_denied) | autenticación | Identificado | API (FastAPI) | stream |
| 18 | [`user_role_changed`](#user_role_changed) | autenticación | Identificado | API (FastAPI) | stream |
| 19 | [`api_latency_recorded`](#api_latency_recorded) | rendimiento | Identificado | API (FastAPI) | batch |
| 20 | [`page_load_recorded`](#page_load_recorded) | rendimiento | Identificado | Frontend (backoffice / web) | batch |
| 21 | [`cache_stats_recorded`](#cache_stats_recorded) | rendimiento | Identificado | API (FastAPI) | batch |
| 22 | [`order_form_validation_failed`](#order_form_validation_failed) | errores | Identificado | Frontend (backoffice / web) | batch |
| 23 | [`api_error_occurred`](#api_error_occurred) | errores | Identificado | API (FastAPI) | stream |
| 24 | [`frontend_error_captured`](#frontend_error_captured) | errores | Identificado | Frontend (backoffice / web) | stream |
| 25 | [`api_request_failed`](#api_request_failed) | errores | Identificado | Frontend (backoffice / web) | batch |
| 26 | [`inventory_filter_applied`](#inventory_filter_applied) | navegación | Identificado | Frontend (backoffice / web) | batch |
| 27 | [`order_form_abandoned`](#order_form_abandoned) | navegación | Identificado | Frontend (backoffice / web) | batch |
| 28 | [`page_viewed`](#page_viewed) | navegación | Identificado | Frontend (backoffice / web) | batch |
| 29 | [`incident_created`](#incident_created) | negocio | Identificado | Frontend (backoffice / web) | batch |
| 30 | [`incident_status_changed`](#incident_status_changed) | negocio | Identificado | API (FastAPI) | batch |
| 31 | [`incident_file_analyzed`](#incident_file_analyzed) | negocio | Identificado | API (FastAPI) | batch |
| 32 | [`supplier_rate_changed`](#supplier_rate_changed) | negocio | Identificado | Frontend (backoffice / web) | batch |

**La frase de cada evento** (si no se pudo completar, el evento no existe):

- Capturamos **`inbound_order_created`** porque necesitamos saber cuánto material se produce/compra, para qué programa y con qué costo, lo que nos permite planificar la producción de material según la demanda esperada de matrículas (Elena).
- Capturamos **`outbound_order_created`** porque necesitamos saber qué programas consumen más material y a qué ritmo, lo que nos permite anticipar la reposición antes de una ola grande de matrículas (Elena).
- Capturamos **`stock_threshold_triggered`** porque necesitamos saber con qué frecuencia un programa se queda sin material disponible, lo que nos permite ajustar el umbral mínimo o acelerar la reimpresión/reproducción de ese material.
- Capturamos **`direct_stock_edit_rejected`** porque necesitamos saber si el personal intenta saltarse el control de trazabilidad del material, lo que nos permite reforzar capacitación o permisos en la oficina donde ocurre con más frecuencia (Patricia).
- Capturamos **`kit_cost_variance_detected`** porque necesitamos saber cuándo un proveedor de material sube precios de forma anómala, lo que nos permite alertar a Elena y a Laura para renegociar o buscar un proveedor alterno.
- Capturamos **`inbound_order_rejected`** porque necesitamos saber qué productos y oficinas acumulan más errores al registrar entradas, lo que nos permite corregir el formulario o el catálogo donde se concentran los rechazos (ej. productos de otra oficina).
- Capturamos **`outbound_order_rejected`** porque necesitamos saber cuántas entregas se intentan sin stock suficiente y en qué programas, lo que nos permite subir el mínimo de esos productos o reponer antes; formar al personal si son errores de datos.
- Capturamos **`stock_depleted`** porque necesitamos saber qué material se agota del todo (no solo baja del mínimo) y cuánto tarda en reponerse, lo que nos permite priorizar la reposición de ese material por encima de otros que solo están bajos.
- Capturamos **`product_created`** porque necesitamos saber a qué ritmo crece el catálogo de material por programa y categoría, lo que nos permite detectar programas nuevos que todavía no tienen kits dados de alta antes de abrir matrículas.
- Capturamos **`product_create_rejected`** porque necesitamos saber si el alta de material falla por SKUs duplicados o datos mal formados, lo que nos permite decidir si hace falta una convención de SKU o validación previa en el formulario.
- Capturamos **`login_succeeded`** porque necesitamos saber cuántos operadores usan el backoffice cada día por oficina y en qué horario, lo que nos permite dimensionar soporte y elegir ventanas de mantenimiento fuera de las horas pico.
- Capturamos **`login_failed`** porque necesitamos saber cuántos intentos de login fallan por día y por qué motivo, lo que nos permite añadir rate limit o CAPTCHA en el login si los fallos de credenciales se disparan, o revisar la API si son errores de servidor.
- Capturamos **`session_expired`** porque necesitamos saber si la duración del token corta el trabajo de los operadores a mitad de una tarea, lo que nos permite ajustar la caducidad del JWT o añadir refresh token.
- Capturamos **`password_reset_requested`** porque necesitamos saber con qué frecuencia la gente olvida la contraseña y si hay picos anómalos, lo que nos permite decidir si hace falta SSO o si un pico indica un abuso del endpoint (no tiene rate limit).
- Capturamos **`password_reset_completed`** porque necesitamos saber cuántos restablecimientos se completan frente a los pedidos, lo que nos permite si muchos no se completan, revisar el email (Resend) o la caducidad del token.
- Capturamos **`password_reset_failed`** porque necesitamos saber si los enlaces de restablecimiento caducan antes de que la gente los use, lo que nos permite ampliar la validez del token o mejorar el texto del email.
- Capturamos **`permission_denied`** porque necesitamos saber si hay usuarios que necesitan funciones que su rol no permite, lo que nos permite revisar los roles o dar acceso a quien lo necesita de verdad.
- Capturamos **`user_role_changed`** porque necesitamos saber quién recibe o pierde permisos de administración y cuándo, lo que nos permite auditar los cambios de permisos y revertir los que no estén justificados.
- Capturamos **`api_latency_recorded`** porque necesitamos saber qué endpoints se degradan al crecer los datos (ej. `/inventory/orders` pasa de 2 a 227 ms con 7000 órdenes), lo que nos permite priorizar paginación, índices o caché en los endpoints que superan 300 ms de p95.
- Capturamos **`page_load_recorded`** porque necesitamos saber si las páginas siguen dentro de los umbrales que dejó la auditoría de Lighthouse con usuarios reales, lo que nos permite volver a optimizar la página que salga de verde en LCP/INP/CLS.
- Capturamos **`cache_stats_recorded`** porque necesitamos saber si los TTL elegidos (30 s resumen, 60 s productos) dan un porcentaje de aciertos útil, lo que nos permite subir, bajar o quitar el caché de cada endpoint con datos reales.
- Capturamos **`order_form_validation_failed`** porque necesitamos saber qué campos del formulario provocan más errores antes de llegar a la API, lo que nos permite mejorar etiquetas, ejemplos o valores por defecto de esos campos.
- Capturamos **`api_error_occurred`** porque necesitamos saber qué endpoints fallan y desde cuándo, lo que nos permite abrir una incidencia y revertir o corregir el despliegue que lo introdujo.
- Capturamos **`frontend_error_captured`** porque necesitamos saber qué errores de JavaScript sufren los usuarios y que nunca llegan a la API, lo que nos permite priorizar la corrección de los errores con más sesiones afectadas.
- Capturamos **`api_request_failed`** porque necesitamos saber si hay problemas de conectividad entre oficinas y el VPS que la API no puede ver, lo que nos permite revisar la red o el despliegue en el VPS si se concentra en una oficina u horario.
- Capturamos **`inventory_filter_applied`** porque necesitamos saber qué vistas del inventario usan los operadores (por oficina, por categoría) y si buscan material que no existe, lo que nos permite decidir qué filtros dejar por defecto y si falta alguno (ej. por programa).
- Capturamos **`order_form_abandoned`** porque necesitamos saber si el registro de órdenes es lo bastante simple o hay pasos donde la gente se rinde, lo que nos permite simplificar el campo donde más se abandona o añadir ayuda contextual.
- Capturamos **`page_viewed`** porque necesitamos saber qué secciones visitan más los operadores y cuáles casi no se usan, lo que nos permite dónde invertir el rediseño del backoffice (Stitch) y qué secciones simplificar o quitar.
- Capturamos **`incident_created`** porque necesitamos saber qué categorías y sedes generan más incidencias, lo que nos permite reforzar el proceso o el equipo de la sede/categoría que más crece.
- Capturamos **`incident_status_changed`** porque necesitamos saber cuánto tardan las incidencias en pasar de abiertas a resueltas por categoría, lo que nos permite fijar objetivos de tiempo de resolución y detectar categorías atascadas.
- Capturamos **`incident_file_analyzed`** porque necesitamos saber qué calidad tienen los CSV de incidencias que se suben (filas inválidas por regla), lo que nos permite corregir en origen la exportación que más filas inválidas genera.
- Capturamos **`supplier_rate_changed`** porque necesitamos saber con qué frecuencia y cuánto cambian las tarifas de los proveedores de servicios, lo que nos permite anticipar el impacto en costes antes de renovar contratos.

### 4.2 Fichas: disparador y allowlist de propiedades

Cada tabla es el **allowlist completo** de `properties`: cualquier otra clave hace que el evento no
valide. *Oblig.* = la clave tiene que estar siempre.


#### Obligatorios (BRIEFING)

##### `inbound_order_created`

- **Se dispara cuando:** El backoffice recibe el 201 de `POST /inventory/orders/inbound` (la API ya hizo commit). Datos de la respuesta: `order_id`, `unit_cost`, `currency`, `stock_after`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer (≥ 1) | sí | Unidades de la orden. |
| `currency` | string: `EUR` \| `USD` | sí | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `order_id` | string | sí | Id de la orden de entrada (AssetEntry.id). |
| `supplier_id` | string | sí | Proveedor normalizado (slug del nombre de la empresa, ej. imprenta-turia). Es una empresa, no una persona. |
| `unit_cost` | number (≥ 0) | sí | Costo unitario en `currency`. |
| `total_cost` | number (≥ 0) | sí | quantity × unit_cost en `currency`. |
| `stock_after` | integer (≥ 0) | sí | Stock calculado tras la operación. |

##### `outbound_order_created`

- **Se dispara cuando:** El backoffice recibe el 201 de `POST /inventory/orders/outbound` (la API ya hizo commit). Datos de la respuesta: `order_id`, `stock_after`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** Sí en origen: `assigned_to` (nombre de la persona). **No se emite**; solo `recipient_type`.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer (≥ 1) | sí | Unidades de la orden. |
| `currency` | string: `EUR` \| `USD` | sí | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `order_id` | string | sí | Id de la orden de salida (AssetExit.id). |
| `recipient_type` | string: `client` \| `candidate` \| `consultant` \| `support_agent` \| `employee` | sí | A quién se entrega, como tipo: nunca el nombre. |
| `exit_type` | string: `allocation` \| `consumption` | sí | Tipo de salida del sistema actual. |
| `stock_after` | integer (≥ 0) | sí | Stock calculado tras la operación. |

##### `stock_threshold_triggered`

- **Se dispara cuando:** Tras el 201 de una salida, con `stock_after` y `min_stock` de la respuesta: el stock **cruza** el mínimo (`stock_before >= min_stock` y `stock_after < min_stock`, con `stock_before = stock_after + quantity`). Una vez por cruce, no en cada salida mientras siga por debajo.
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer (≥ 1) | sí | Unidades de la orden. |
| `currency` | string: `EUR` \| `USD` | sí | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `min_stock` | integer (≥ 0) | sí | Umbral configurado del producto. |
| `stock_before` | integer (≥ 0) | sí | Stock antes de la salida. |
| `stock_after` | integer (≥ 0) | sí | Stock calculado tras la operación. |
| `trigger_order_id` | string | sí | Id de la orden de salida que provocó el cruce. |

##### `direct_stock_edit_rejected`

- **Se dispara cuando:** Desde la tabla de stock, el usuario usa «Ajustar stock» para fijar el stock a mano; el backoffice manda la petición (`PATCH /inventory/products/{id}` con `current_stock`) y la API la rechaza (405, o 422 por `extra="forbid"`). Lo detecta el cliente de inventario (`lib/inventory.ts`) para cualquier petición de ese tipo.
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** No. `userId` (UUID interno) va en el envelope; el body completo **no** se registra.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | no | Oficina del producto si se pudo resolver el id; si no, ausente. |
| `product_id` | string | no | Id del producto si venía en la ruta. |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | no | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | no | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer | no | Cantidad que se intentó fijar, si venía en el body. |
| `currency` | string: `EUR` \| `USD` | no | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `http_method` | string: `POST` \| `PUT` \| `PATCH` \| `DELETE` | sí | Método usado. |
| `route` | string | sí | Plantilla de ruta sin ids ni query (ej. /inventory/products/{id}). |
| `status_code` | integer: `405` \| `422` | sí | Respuesta de la API. |
| `rejected_fields` | array de `current_stock` \| `stock` \| `quantity` | no | Nombres de los campos de stock enviados (sin sus valores). |
| `user_role` | string: `admin` \| `manager` \| `user` | sí | Rol del usuario en el momento del intento. |

##### `kit_cost_variance_detected`

- **Se dispara cuando:** Tras el 201 de una entrada, con `unit_cost` y `cost_baseline` de la respuesta: `|unit_cost − baseline| / baseline > 0.10`. La API calcula `baseline` como la media del coste de las últimas 5 entradas del mismo producto y proveedor (mínimo 2 previas; si no, `cost_baseline` es null y no se evalúa).
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer (≥ 1) | sí | Unidades de la orden. |
| `currency` | string: `EUR` \| `USD` | sí | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `order_id` | string | sí | Id de la orden de entrada que dispara la alerta. |
| `supplier_id` | string | sí | Proveedor normalizado (slug). |
| `unit_cost` | number (≥ 0) | sí | Costo unitario de esta orden. |
| `baseline_unit_cost` | number (≥ 0) | sí | Media de las últimas entradas comparables. |
| `variance_pct` | number | sí | Variación en % con signo (ej. 12.5 = subió un 12.5 %). |
| `threshold_pct` | number (≥ 0) | sí | Umbral aplicado (10 por defecto). |
| `baseline_sample_size` | integer (≥ 2, ≤ 5) | sí | Cuántas entradas forman la media (2–5). |


#### Identificados — inventario

##### `inbound_order_rejected`

- **Se dispara cuando:** El backoffice recibe 400/404/422 de `POST /inventory/orders/inbound`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | no | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | no | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | no | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | no | Programa (slug, ej. ventas-b2b). |
| `status_code` | integer: `400` \| `404` \| `422` | sí | Código HTTP. |
| `error_code` | string: `asset_not_found` \| `office_mismatch` \| `invalid_quantity` \| `missing_field` \| `invalid_value` \| `other` | sí | Motivo normalizado. |
| `invalid_fields` | array de string | no | Campos con error (sin valores). |

##### `outbound_order_rejected`

- **Se dispara cuando:** El backoffice recibe 400/404/422 de `POST /inventory/orders/outbound`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | no | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | no | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | no | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | no | Programa (slug, ej. ventas-b2b). |
| `quantity` | integer (≥ 1) | no | Cantidad pedida. |
| `stock_available` | integer (≥ 0) | no | Stock que había (solo si el motivo es falta de stock). |
| `status_code` | integer: `400` \| `404` \| `422` | sí | Código HTTP. |
| `error_code` | string: `insufficient_stock` \| `asset_not_found` \| `office_mismatch` \| `assigned_to_required` \| `assigned_to_not_allowed` \| `invalid_quantity` \| `missing_field` \| `other` | sí | Motivo normalizado. |

##### `stock_depleted`

- **Se dispara cuando:** Tras el 201 de una salida, `stock_after` de la respuesta es 0.
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `trigger_order_id` | string | sí | Orden de salida que dejó el stock a 0. |

##### `product_created`

- **Se dispara cuando:** `POST /inventory/products` responde 201.
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | sí | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_id` | string | sí | Id del producto (Asset.id como texto). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | sí | Categoría del BRIEFING. |
| `programme_id` | string (patrón `^[a-z0-9]+(-[a-z0-9]+)*$`) | sí | Programa (slug, ej. ventas-b2b). |
| `min_stock` | integer (≥ 0) | sí | Umbral inicial configurado. |

##### `product_create_rejected`

- **Se dispara cuando:** `POST /inventory/products` responde 409/422.
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `office` | string: `valencia` \| `miami` | no | Oficina del material o de la operación (minúsculas, como el BRIEFING). |
| `product_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | no | Categoría del BRIEFING. |
| `status_code` | integer: `409` \| `422` | sí | Código HTTP. |
| `error_code` | string: `duplicate_sku` \| `invalid_category` \| `invalid_office` \| `missing_field` \| `other` | sí | Motivo normalizado. |


#### Identificados — autenticación

##### `login_succeeded`

- **Se dispara cuando:** El login responde 200 y el backoffice lee el rol con `GET /auth/me`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `user_role` | string: `admin` \| `manager` \| `user` | sí | Rol devuelto por `GET /auth/me`. |

##### `login_failed`

- **Se dispara cuando:** El formulario de login recibe 401 (credenciales), 429, 5xx o no obtiene respuesta. El motivo se deduce del status: el backoffice nunca ve si el email existe.
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** Sí en origen (email y contraseña escritos en el formulario). **Nunca se emiten**: solo `reason`.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `reason` | string: `invalid_credentials` \| `rate_limited` \| `server_error` \| `network_error` | sí | Motivo deducido del status (401 → invalid_credentials, 429 → rate_limited, 5xx → server_error, sin respuesta → network_error). |

##### `session_expired`

- **Se dispara cuando:** Una llamada a la API con token devuelve 401 por token caducado y el backoffice redirige a /login.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `page` | string | sí | Ruta del frontend como plantilla, sin query ni hash (ej. /inventory/orders/inbound). |
| `had_unsaved_form` | boolean | sí | Si había un formulario con cambios sin enviar. |

##### `password_reset_requested`

- **Se dispara cuando:** `POST /auth/forgot-password` (siempre responde 200, exista o no la cuenta).
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** Sí en origen (email). Se emite solo `account_ref`.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `account_exists` | boolean | sí | Si el email correspondía a una cuenta (solo visible en telemetría, nunca en la respuesta). |
| `account_ref` | string (patrón `^[0-9a-f]{16}$`) | sí | HMAC del email, como en login_failed. |

##### `password_reset_completed`

- **Se dispara cuando:** `POST /auth/reset-password` responde 200.
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `token_age_minutes` | integer (≥ 0) | sí | Minutos desde que se pidió el token. |

##### `password_reset_failed`

- **Se dispara cuando:** `POST /auth/reset-password` responde 400 (o 422 si la contraseña no cumple la política).
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `reason` | string: `token_not_found` \| `token_expired` \| `token_used` \| `user_inactive` \| `weak_password` | sí | Motivo interno (la API responde el mismo 400 genérico). |

##### `permission_denied`

- **Se dispara cuando:** Cualquier endpoint responde 403 a un usuario autenticado (ej. un `user` en `/users`).
- **Emite:** API (FastAPI) · **Entrega:** stream · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `route` | string | sí | Plantilla de ruta sin ids ni query (ej. /inventory/products/{id}). |
| `http_method` | string: `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` | sí | Método. |
| `user_role` | string: `admin` \| `manager` \| `user` | sí | Rol. |

##### `user_role_changed`

- **Se dispara cuando:** `PUT /users/{id}` cambia `role` o `is_active`.
- **Emite:** API (FastAPI) · **Entrega:** stream · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `target_user_id` | string (uuid) | sí | UUID interno del usuario modificado. |
| `previous_role` | string: `admin` \| `manager` \| `user` | sí | Rol anterior. |
| `new_role` | string: `admin` \| `manager` \| `user` | sí | Rol nuevo. |
| `is_active` | boolean | sí | Estado tras el cambio. |


#### Identificados — rendimiento

##### `api_latency_recorded`

- **Se dispara cuando:** Agregado del middleware de timing: un evento por ruta y método cada 60 s con las peticiones de esa ventana (no uno por petición).
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Agregado en servidor: 1 evento por ruta+método por minuto.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `route` | string | sí | Plantilla de ruta sin ids ni query (ej. /inventory/products/{id}). |
| `http_method` | string: `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` | sí | Método. |
| `window_seconds` | integer: `60` | sí | Duración de la ventana. |
| `request_count` | integer (≥ 1) | sí | Peticiones en la ventana. |
| `p50_ms` | number (≥ 0) | sí | Mediana. |
| `p95_ms` | number (≥ 0) | sí | Percentil 95. |
| `max_ms` | number (≥ 0) | sí | Máximo. |
| `error_count` | integer (≥ 0) | sí | Respuestas 5xx en la ventana. |
| `cache_hit_ratio` | number (≥ 0, ≤ 1) | no | Aciertos/peticiones si la ruta está cacheada (0–1). |

##### `page_load_recorded`

- **Se dispara cuando:** Al cargar una página del backoffice o la web pública se miden las Core Web Vitals (librería `web-vitals`).
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** 1 evento por carga de página, con todas las métricas juntas; muestreo 50 % en la web pública.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `page` | string | sí | Ruta del frontend como plantilla, sin query ni hash (ej. /inventory/orders/inbound). |
| `app` | string: `backoffice` \| `website` | sí | Aplicación. |
| `lcp_ms` | number (≥ 0) | no | Largest Contentful Paint. |
| `inp_ms` | number (≥ 0) | no | Interaction to Next Paint. |
| `cls` | number (≥ 0) | no | Cumulative Layout Shift. |
| `ttfb_ms` | number (≥ 0) | no | Time to First Byte. |
| `device_type` | string: `desktop` \| `mobile` \| `tablet` | sí | Tipo de dispositivo (no el user agent). |
| `connection_type` | string: `slow-2g` \| `2g` \| `3g` \| `4g` | no | navigator.connection.effectiveType si existe. |

##### `cache_stats_recorded`

- **Se dispara cuando:** Tarea periódica cada 5 min lee `GET /api/cache/stats` (proyecto Caching).
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** 1 evento por caché cada 5 min.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `cache_name` | string: `incidents_summary` \| `inventory_products` | sí | Caché. |
| `hits` | integer (≥ 0) | sí | Aciertos en la ventana. |
| `misses` | integer (≥ 0) | sí | Fallos en la ventana. |
| `entries` | integer (≥ 0) | sí | Entradas vivas. |
| `ttl_seconds` | number (≥ 0) | sí | TTL configurado. |


#### Identificados — errores

##### `order_form_validation_failed`

- **Se dispara cuando:** La validación en cliente bloquea el envío de un formulario de orden.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Máximo 1 por envío.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `form` | string: `inbound_order` \| `outbound_order` | sí | Formulario. |
| `invalid_fields` | array de `asset_id` \| `quantity` \| `supplier` \| `unit_cost` \| `exit_type` \| `assigned_to` \| `recipient_type` \| `office` | sí | Campos con error (sin valores). |

##### `api_error_occurred`

- **Se dispara cuando:** Cualquier respuesta 5xx o excepción no controlada en la API.
- **Emite:** API (FastAPI) · **Entrega:** stream · **Datos personales:** Puede haberlo en el mensaje de la excepción: **no se emite el mensaje ni el traceback**, solo clase y fingerprint. El traceback queda en los logs del servidor, enlazado por `requestId`.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `route` | string | sí | Plantilla de ruta sin ids ni query (ej. /inventory/products/{id}). |
| `http_method` | string: `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` | sí | Método. |
| `status_code` | integer (≥ 500, ≤ 599) | sí | Código HTTP. |
| `error_class` | string | sí | Clase de la excepción (ej. OperationalError). |
| `fingerprint` | string (patrón `^[0-9a-f]{12}$`) | sí | Hash de clase + archivo + línea, para agrupar el mismo fallo. |

##### `frontend_error_captured`

- **Se dispara cuando:** `window.onerror`, `unhandledrejection` o un error boundary de React en el backoffice o la web.
- **Emite:** Frontend (backoffice / web) · **Entrega:** stream · **Datos personales:** Posible en el mensaje: se recorta y se sanea con expresiones regulares (emails → `[email]`, secuencias de 6+ dígitos → `[n]`, todo lo que va tras `?` → eliminado).
- **Throttle/debounce:** Dedupe por fingerprint: máximo 1 por minuto y 20 por sesión.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `page` | string | sí | Ruta del frontend como plantilla, sin query ni hash (ej. /inventory/orders/inbound). |
| `app` | string: `backoffice` \| `website` | sí | Aplicación. |
| `error_name` | string | sí | Nombre del error (TypeError…). |
| `message` | string (máx. 200) | sí | Mensaje recortado a 200 caracteres y saneado (sin emails, números largos ni query strings). |
| `source` | string: `onerror` \| `unhandledrejection` \| `error_boundary` | sí | Origen. |
| `fingerprint` | string (patrón `^[0-9a-f]{12}$`) | sí | Hash de nombre + primer frame del stack. |
| `release` | string | no | Versión/commit desplegado. |

##### `api_request_failed`

- **Se dispara cuando:** El cliente HTTP del backoffice no obtiene respuesta (error de red, timeout, CORS).
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Máximo 1 por ruta cada 30 s por sesión.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `route` | string | sí | Plantilla de ruta sin ids ni query (ej. /inventory/products/{id}). |
| `http_method` | string: `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` | sí | Método. |
| `failure_type` | string: `network` \| `timeout` \| `cors` \| `aborted` | sí | Tipo de fallo. |
| `elapsed_ms` | number (≥ 0) | sí | Tiempo hasta el fallo. |


#### Identificados — navegación

##### `inventory_filter_applied`

- **Se dispara cuando:** El usuario cambia un filtro del listado de productos o del historial de órdenes (con debounce, ver §4.2).
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Debounce 800 ms: solo el último valor de una serie de cambios rápidos.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `page` | string | sí | Ruta del frontend como plantilla, sin query ni hash (ej. /inventory/orders/inbound). |
| `filter_office` | string: `valencia` \| `miami` | no | Oficina filtrada (ausente = todas). |
| `filter_category` | string: `training_kit` \| `certification` \| `onboarding_equipment` | no | Categoría filtrada (ausente = todas). |
| `results_count` | integer (≥ 0) | sí | Filas devueltas. |

##### `order_form_abandoned`

- **Se dispara cuando:** El usuario modifica al menos un campo del formulario de entrada o salida y sale de la página (cambio de ruta o `pagehide`) sin enviarlo.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Una vez por instancia del formulario.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `form` | string: `inbound_order` \| `outbound_order` | sí | Formulario abandonado. |
| `last_field` | string: `asset_id` \| `quantity` \| `supplier` \| `unit_cost` \| `exit_type` \| `assigned_to` \| `recipient_type` \| `office` | no | Último campo tocado (nombre del campo, nunca su valor). |
| `fields_completed` | integer (≥ 0) | sí | Campos con valor al salir. |
| `had_validation_error` | boolean | sí | Si llegó a ver un error de validación. |
| `time_on_form_ms` | integer (≥ 0) | sí | Tiempo desde el primer cambio. |

##### `page_viewed`

- **Se dispara cuando:** Cambio de ruta en el backoffice (App Router) o carga de una página de la web pública.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No
- **Throttle/debounce:** Debounce 1 s: si la ruta cambia dos veces en menos de 1 s solo cuenta la última.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `page` | string | sí | Ruta del frontend como plantilla, sin query ni hash (ej. /inventory/orders/inbound). |
| `app` | string: `backoffice` \| `website` | sí | Aplicación. |
| `referrer_page` | string | no | Página interna anterior (plantilla). Nunca el referrer externo completo. |
| `ui_locale` | string: `es` \| `en` | sí | Idioma de la interfaz. Dimensión independiente de la oficina (BRIEFING §6). |


#### Identificados — negocio

##### `incident_created`

- **Se dispara cuando:** El backoffice recibe el 201 de `POST /api/incidents`.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `category` | string: `technical_failure` \| `process_error` \| `client_complaint` \| `candidate_issue` \| `staff_issue` \| `sla_breach` \| `data_quality` \| `other` | sí | Categoría de la incidencia. |
| `origin` | string: `customer` \| `branch` \| `internal` | sí | Origen. |
| `branch` | string: `central` \| `valencia_operations` \| `miami_office` \| `remote` | sí | Sede de la incidencia (valores del gestor de incidencias). |

##### `incident_status_changed`

- **Se dispara cuando:** `PATCH /api/incidents/{id}/status` aplica una transición.
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `incident_id` | string | sí | Id de la incidencia. |
| `from_status` | string: `open` \| `in_progress` \| `resolved` \| `discarded` | sí | Estado anterior. |
| `to_status` | string: `open` \| `in_progress` \| `resolved` \| `discarded` | sí | Estado nuevo. |
| `category` | string: `technical_failure` \| `process_error` \| `client_complaint` \| `candidate_issue` \| `staff_issue` \| `sla_breach` \| `data_quality` \| `other` | sí | Categoría. |
| `minutes_in_previous_status` | integer (≥ 0) | sí | Minutos en el estado anterior. |

##### `incident_file_analyzed`

- **Se dispara cuando:** `POST /api/incidents/analyze` procesa un CSV.
- **Emite:** API (FastAPI) · **Entrega:** batch · **Datos personales:** El CSV puede contener nombres: **solo se emiten contadores**, nunca filas ni el nombre del archivo.

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `rows_total` | integer (≥ 0) | sí | Filas del archivo. |
| `rows_invalid` | integer (≥ 0) | sí | Filas inválidas. |
| `invalid_rules` | array de string | no | Reglas incumplidas (nombres). |
| `file_size_kb` | number (≥ 0) | sí | Tamaño del archivo. |

##### `supplier_rate_changed`

- **Se dispara cuando:** El backoffice recibe el 200 de `PATCH /suppliers/{id}/rate`; la tarifa anterior es la de la fila antes del cambio.
- **Emite:** Frontend (backoffice / web) · **Entrega:** batch · **Datos personales:** No

| Propiedad (allowlist) | Tipo | Oblig. | Descripción |
| --- | --- | --- | --- |
| `supplier_id` | string | sí | Id del proveedor. |
| `category` | string | no | Categoría del proveedor (directorio). |
| `currency` | string: `EUR` \| `USD` | sí | Moneda de la oficina (EUR Valencia, USD Miami). Sin conversión. |
| `previous_monthly_rate` | number (≥ 0) | sí | Tarifa anterior. |
| `new_monthly_rate` | number (≥ 0) | sí | Tarifa nueva. |
| `change_pct` | number | sí | Variación en %. |


---

## 5. Estrategia de entrega

### 5.1 Stream vs. batch

- **Stream:** el evento se procesa en cuanto llega (en el proyecto de almacenamiento: inserción
  inmediata + aviso). Solo para decisiones que pierden valor en horas.
- **Batch:** el evento se guarda y se procesa en lotes (agregados diarios/semanales, reporte técnico
  con caché de 60 s del proyecto de reporte). Es el valor por defecto.

| `event_type` | Entrega | Por qué (urgencia de la decisión) |
| --- | --- | --- |
| `stock_threshold_triggered` | **stream** | Si se procesa en lote, el programa puede quedarse sin kits antes de que alguien lo vea: la reposición tarda días. |
| `direct_stock_edit_rejected` | **stream** | Es un control de seguridad: varios intentos seguidos de la misma cuenta deben verse el mismo día, no en el reporte de la semana. |
| `kit_cost_variance_detected` | **stream** | Hay que avisar mientras la orden aún se puede discutir con el proveedor; una semana después ya está pagada. |
| `stock_depleted` | **stream** | Con stock 0 cualquier entrega de ese programa falla ya: es más grave que el umbral y tiene que verse en el momento. |
| `login_failed` | **stream** | Un ataque de fuerza bruta se para en minutos o no se para; en lote llega tarde. |
| `permission_denied` | **stream** | Repetido en poco tiempo puede ser un intento de escalada de privilegios: se tiene que ver el mismo día. |
| `user_role_changed` | **stream** | Un admin no autorizado tiene que detectarse antes de que actúe. |
| `api_error_occurred` | **stream** | Un 500 en las órdenes bloquea el trabajo de la oficina: hay que saberlo en minutos. |
| `frontend_error_captured` | **stream** | Tras un despliegue, un error que rompe una página entera se tiene que ver antes de que llamen los operadores. |
| `inbound_order_created` | **batch** | Alimenta planificación semanal/mensual de producción; nadie actúa en minutos sobre una entrada. |
| `outbound_order_created` | **batch** | Se usa en agregados diarios por programa y oficina; la alerta urgente la cubre `stock_threshold_triggered`. |
| `inbound_order_rejected` | **batch** | Se analiza por tendencias semanales; un rechazo suelto no requiere acción inmediata. |
| `outbound_order_rejected` | **batch** | Igual que las entradas rechazadas: tendencia semanal. El caso urgente (sin stock) ya lo cubre el umbral. |
| `product_created` | **batch** | Cambia pocas veces al mes; basta el resumen periódico. |
| `product_create_rejected` | **batch** | Volumen bajo; se revisa en el reporte técnico. |
| `login_succeeded` | **batch** | Uso diario; no hay decisión urgente. |
| `session_expired` | **batch** | Afecta a la configuración, que se revisa con datos de varias semanas. |
| `password_reset_requested` | **batch** | Volumen bajo; el abuso se ve en el agregado diario. |
| `password_reset_completed` | **batch** | Embudo de varios días. |
| `password_reset_failed` | **batch** | Embudo de varios días. |
| `api_latency_recorded` | **batch** | Se decide sobre tendencias; los fallos graves ya salen en `api_error_occurred`. |
| `page_load_recorded` | **batch** | Se revisa por percentiles semanales. |
| `cache_stats_recorded` | **batch** | Ajuste de configuración, no operación. |
| `order_form_validation_failed` | **batch** | Se mira por tendencia; no requiere reacción inmediata. |
| `api_request_failed` | **batch** | Se interpreta por patrones; los 5xx reales ya van en stream desde la API. |
| `inventory_filter_applied` | **batch** | Uso de la interfaz: sirve para el rediseño, no para operar. |
| `order_form_abandoned` | **batch** | Métrica de UX agregada semanalmente. |
| `page_viewed` | **batch** | Uso agregado semanal. |
| `incident_created` | **batch** | Reporte semanal. |
| `incident_status_changed` | **batch** | Se calcula sobre series de días. |
| `incident_file_analyzed` | **batch** | Uso ocasional. |
| `supplier_rate_changed` | **batch** | Revisión mensual de costes. |

### 5.2 Throttle y debounce

| Evento | Frecuencia sin control | Estrategia |
| --- | --- | --- |
| `api_latency_recorded` | una por petición HTTP | **Agregado en servidor**: el middleware de timing acumula por ruta+método y emite un evento por minuto con `request_count`, `p50_ms`, `p95_ms`, `max_ms`, `error_count`. Es la diferencia entre ~1 evento/min y miles. |
| `page_viewed` | cada cambio de ruta, también redirecciones | Debounce 1 s: si la ruta cambia dos veces en menos de 1 s (ej. redirección a `/login`), solo cuenta la última. |
| `inventory_filter_applied` | cada tecla o cambio de select | Debounce 800 ms: solo el último valor de una serie de cambios. |
| `frontend_error_captured` | un bucle de render puede lanzar cientos por segundo | Dedupe por `fingerprint`: máx. 1 por minuto por fingerprint y 20 por sesión. |
| `api_request_failed` | cada reintento contra una API caída | Máx. 1 por ruta cada 30 s por sesión. |
| `page_load_recorded` | una por carga | Muestreo 50 % en la web pública; 100 % en el backoffice (pocos usuarios). |
| `cache_stats_recorded` | — | Una lectura cada 5 min por caché. |
| `order_form_abandoned` | — | Una vez por instancia del formulario. |
| `login_failed` | puede ser muy alta en un ataque | **Sin throttle en la emisión**: el volumen es justo la señal. El rate limit va en el endpoint de login, no en la telemetría. |

**Transporte desde el frontend** (se implementa en el proyecto de captura): cola en memoria; envío en
lotes cada 10 s o al llegar a 20 eventos; `navigator.sendBeacon` cuando la pestaña se oculta
(`visibilitychange`) o se cierra (`pagehide`) para no perder los últimos; hasta 3 reintentos con
backoff exponencial (1 s, 2 s, 4 s) y después se descarta el lote; deduplicación por `eventId`
en el servidor (§5.3). Implementado en `uis/backoffice/lib/telemetry.ts`.

### 5.3 Almacenamiento: tabla `telemetry_events`

Receptor: `POST /telemetry/events` (`services/api/app/routers/telemetry.py`), misma URL que el
stub. Valida **cada evento por separado** (envelope con `TelemetryEvent` + allowlist de
`event-schemas.json`), guarda los válidos en **un único INSERT por lote** y responde
`{"received", "stored", "rejected"}`. Un evento inválido no cancela el lote.

| Columna | Tipo | Origen |
| --- | --- | --- |
| `id` | `uuid` PK, default `gen_random_uuid()` | generado |
| `timestamp` | `timestamptz` NOT NULL | `timestamp` del envelope (momento del hecho) |
| `service` | `text` NOT NULL | `source` del envelope (`backoffice`, `api`…) |
| `event_type` | `text` NOT NULL | `event_type` |
| `level` | `text` default `info` | `error`: `frontend_error_captured`, `api_error_occurred`. `warn`: rechazos (`*_rejected`), fallos (`*_failed`), `session_expired`, `permission_denied`, `stock_threshold_triggered`, `stock_depleted`, `kit_cost_variance_detected`. Resto: `info` |
| `value` | `numeric` nullable | la magnitud principal del evento: `quantity` (órdenes creadas, salida rechazada, intento de editar stock), `stock_after` (umbral), `variance_pct` (coste), `lcp_ms` (carga de página), `p95_ms` (latencia API), `elapsed_ms` (petición fallida), `time_on_form_ms` (abandono), `change_pct` (tarifa), `minutes_in_previous_status` (incidencia). Resto: `null` |
| `message` | `text` nullable | `event_type · office=… · programme_id=… · product_id=… · page=… · route=… · reason=… · error_code=… · status_code=…` (las que tenga el evento) |
| `tags` | `jsonb` default `{}` | `properties` del evento (ya filtradas por su allowlist: incluye `office` y `programme_id` para agregar por oficina y programa) **+** `_envelope`: `event_id`, `session_id`, `user_id`, `schema_version`, `request_id`, `environment` |

- Índices: `timestamp`, `event_type` y GIN sobre `tags`.
- **Solo inserción:** no hay código que actualice o borre, y en PostgreSQL el trigger
  `telemetry_events_no_update_delete` rechaza cualquier `UPDATE` o `DELETE`.
- **Idempotencia:** un `eventId` que ya está guardado (reintento del frontend) no se inserta
  otra vez y cuenta como guardado.
- La tabla la crea la API al arrancar (`create_all`); `uv run migrate-telemetry` asegura el
  default del `id` y el trigger si la tabla ya existía.

---

## 6. Privacidad y datos personales

| Dato | Dónde aparece en origen | Qué hace la telemetría |
| --- | --- | --- |
| Email | login, forgot-password | **No se emite.** `login_failed` solo lleva el motivo. En los eventos que emite la API (`password_reset_requested`) va `account_ref` = HMAC-SHA256(email normalizado, clave del servidor), 16 primeros hex: permite contar por cuenta sin guardar el email. |
| Nombre de la persona que recibe un kit (`assigned_to`) | orden de salida | **No se emite.** Solo `recipient_type`. |
| Nombres de candidatos, clientes o consultores | CSV de incidencias, formularios | **No se emiten.** Solo contadores o categorías. |
| Contraseñas, tokens JWT, tokens de reset | auth | **Nunca**, ni en eventos de error. |
| Mensajes de excepción y stack traces | errores | API: solo clase + `fingerprint`; el traceback queda en el log del servidor, enlazado por `requestId`. Frontend: mensaje recortado a 200 caracteres y saneado (emails → `[email]`, 6+ dígitos → `[n]`, query strings fuera). |
| IP y user agent | toda petición | **No se guardan.** Solo `device_type` (desktop/mobile/tablet) y `connection_type`. |
| URLs | navegación | Plantillas de ruta, sin query ni hash (los filtros van en propiedades con enum). |
| `userId` | todos | Es un UUID interno, seudónimo: no identifica a nadie fuera del sistema. Si un usuario se borra, sus eventos se conservan con su UUID, que ya no resuelve a nadie. |

**Retención propuesta:** eventos en crudo 90 días; agregados por oficina/programa sin límite.

---

## 7. Riesgos y exclusiones

### 7.1 Eventos considerados y descartados

| Evento | Por qué no |
| --- | --- |
| `inventory_list_viewed` por petición de API | Duplica `page_viewed` + `api_latency_recorded`. No añade ninguna decisión. |
| `button_clicked` genérico | Sin hipótesis: «por si acaso». Los clics que importan ya tienen evento propio (envío de órdenes, filtros, abandono). |
| `mouse_moved` / grabación de sesión | Coste alto, riesgo de capturar datos de formularios y ninguna decisión concreta. |
| `stock_level_viewed` (ver el stock de un producto) | El stock ya se reconstruye a partir de las órdenes; mirarlo no cambia ninguna decisión. |
| `outbound_order_created` con nombre del receptor | Pedido implícito en «quién recibe más material». Se resuelve con `recipient_type`; el nombre es PII y el BRIEFING lo prohíbe. |
| Un `api_latency_recorded` por petición | Volumen desproporcionado para una decisión que se toma con percentiles: se agrega por minuto (§5.2). |
| `search_performed` con el texto buscado | El texto libre puede contener nombres de personas. Si hace falta, solo la longitud y si hubo resultados. |
| Conversión de costes a una moneda común | El BRIEFING lo prohíbe en la capa de telemetría; se hará, si hace falta, en el reporte. |
| Eventos del talent-pipeline-tracker (`uis/talent-pipeline-tracker`) | Consume la API externa de 4Geeks y maneja datos de candidatos; queda fuera hasta tener un BRIEFING que diga qué medir sin exponerlos. |
| Formulario de candidaturas de la web pública | Todo su contenido es PII de candidatos. Como mucho, en el futuro, `application_form_submitted` sin propiedades personales; no hay hoy una decisión que lo pida. |

### 7.2 Riesgos

- **Brecha de datos (§1.3).** Hasta que el inventario tenga `programme_id`, `unit_cost`, `min_stock` y
  las categorías del BRIEFING, tres de las cinco métricas obligatorias no se pueden emitir completas.
  Es lo primero del proyecto de captura.
- **Fuerza bruta por cuenta.** `login_failed` sale del backoffice, que no puede calcular un
  identificador seguro de la cuenta (el HMAC necesita la clave del servidor): sirve para ver
  picos, no para saber si todos los fallos van contra la misma cuenta. Eso requiere emitirlo
  también desde la API (fase de almacenamiento).
- **Doble conteo.** Un reintento del cliente puede repetir un evento: por eso `eventId` es la clave de
  deduplicación y los eventos de negocio salen de la API tras el commit, no del frontend.
- **Umbral de varianza ruidoso.** Con menos de 2 entradas previas del mismo producto y proveedor no hay
  baseline fiable: no se emite `kit_cost_variance_detected` (mejor perder una alerta que alertar sin base).
  El 10 % es configurable (`threshold_pct` va en el evento para poder auditarlo).
- **Alertas repetidas de umbral.** Si se emitiera en cada salida bajo el mínimo, un producto bajo
  generaría una alerta por entrega. Se emite solo al **cruzar** el umbral.
- **Telemetría que tumba la API.** El envío es asíncrono y con try/except: si el almacén de eventos
  cae, se pierde telemetría, no órdenes.
- **Caché y métricas.** Los eventos de negocio se emiten en los endpoints de escritura, que no pasan por
  el caché del proyecto Caching; ningún evento depende de una respuesta cacheada.
- **Varios procesos.** `api_latency_recorded` se agrega en memoria por proceso: con varios workers
  habrá un evento por worker y minuto; el reporte tiene que sumarlos.

---

## 8. Mantenimiento de los esquemas

- `event-schemas.json` es la fuente que valida el almacenamiento. Este documento y el JSON tienen que
  cambiar juntos.
- Cambios compatibles (añadir una propiedad **opcional**, un valor nuevo a un enum): sube el *minor*
  (`1.1.0`).
- Cambios incompatibles (quitar o renombrar una propiedad, hacerla obligatoria, cambiar su tipo):
  sube el *major* (`2.0.0`) y durante una transición el almacenamiento acepta las dos versiones.
- Validar un evento en Python:

```python
import json
from jsonschema import Draft7Validator, FormatChecker

schema = json.load(open("docs/telemetry/event-schemas.json", encoding="utf-8"))
Draft7Validator(schema, format_checker=FormatChecker()).validate(event)  # lanza si no cumple
```
