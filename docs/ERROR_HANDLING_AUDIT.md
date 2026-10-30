# Auditoría de gestión de errores — Monorepo Nexova

- **Fecha:** 2026-10-30
- **Rama:** `feature/error-handling-audit`
- **Alcance:** `uis/backoffice`, `uis/talent-pipeline-tracker`, `services/api` y los scripts Python. Se excluyen `node_modules`, `.next`, `.venv`, `__pycache__`, los archivos generados y los tests.
- **Modo:** solo lectura. Este informe no modifica código.

## Scripts Python localizados

| Script | Ruta | Función |
|---|---|---|
| Analizador de incidentes | `scripts/analyze.py` | CLI que analiza un CSV de tickets y, opcionalmente, exporta `results.csv` |
| Seed del CSV de incidencias | `scripts/seed_incidents.py` | Carga `scripts/incidents-nexova.csv` en `services/api/data/incidents.json` |
| Seed de proveedores | `services/api/app/seed.py` | `uv run seed` |
| Alta de admin | `services/api/app/create_admin.py` | `create-admin` |
| Snippet de limpieza | `skills/data-analysis/scripts/pandas_clean.py` | Plantilla de la skill de análisis |
| Lógica compartida | `packages/shared/incidents_core/incidents_core/` | `load_csv`, `parse_rows`, `analyze_rows`… (usada por los scripts y la API) |

`agents/_template/agent.py` está vacío (0 bytes).

## Leyenda de categorías

1. Try/catch ausente
2. Catch demasiado amplio
3. Fallo silencioso
4. Exposición de errores en crudo
5. Filtración de datos sensibles
6. Estados de carga/error ausentes en la UI
7. Sin llamada a la acción
8. Sin `sys.exit` en un fallo de script
9. Extra: `finally`, accesos a undefined, logs con información interna, etc.

## Resumen

| Severidad | Frontend | Backend | Scripts | Total |
|---|---:|---:|---:|---:|
| CRÍTICO | 0 | 0 | 0 | **0** |
| ALTO | 5 | 1 | 0 | **6** |
| MEDIO | 17 | 4 | 2 | **23** |
| BAJO | 17 | 4 | 5 | **26** |

No se ha encontrado ningún hallazgo crítico: no hay secretos (`SECRET_KEY`, `RESEND_API_KEY`) en logs ni en respuestas, ni stack traces que lleguen al cliente. La base es buena: un middleware que convierte cualquier excepción no controlada en un 500 genérico, mensajes genéricos en login y forgot-password, clientes HTTP con try/catch ante caídas de red y ningún `console.*` en los frontends. Los problemas se concentran en tres puntos:

- Los mensajes técnicos llegan a la UI (`err.message`, `detail` del backend, "Error 500").
- Ninguna de las dos apps Next.js tiene páginas de error (`error.tsx`, `global-error.tsx` ni `not-found.tsx`).
- El alta de usuarios revela si un email está registrado.

---

## CRÍTICO

Ninguno.

---

## ALTO

### Frontend

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| A1 | `uis/backoffice/app/` (no hay archivo) | 9, 7 | No existe `error.tsx`, `global-error.tsx` ni `not-found.tsx` en `app/`, `(panel)` ni `(auth)`. Un fallo al renderizar (ver M5 y B3) deja la pantalla de error de Next sin forma de recuperarse. | Añadir `app/global-error.tsx`, `app/(panel)/error.tsx` (con `reset()` y enlace al inicio) y `app/not-found.tsx`. |
| A2 | `uis/backoffice/components/RegisterForm.tsx:89-90` | 5 | Ante un 409, muestra «Ya existe una cuenta con este email.»: revela qué emails están registrados. | Mensaje neutro («No se ha podido crear la cuenta; si ya tienes una, inicia sesión o recupera la contraseña») junto con el arreglo del backend (A6). |
| A3 | `uis/talent-pipeline-tracker/app/` (no hay archivo) | 9, 7 | No hay fronteras de error ni `not-found.tsx`. El `throw` de `useMe()` (`components/AuthGuard.tsx:15`) o un `records.length` sobre undefined (A5) tumban la app entera. | Añadir `app/error.tsx` con `reset()` y enlace al inicio, `app/global-error.tsx` y `app/not-found.tsx`. |
| A4 | `uis/talent-pipeline-tracker/components/RecordForm.tsx:66-68`, `components/NotesSection.tsx:71-73` y `88-90`, `app/(app)/candidates/[id]/page.tsx:47-49` | 4 | El aviso concatena `err.message`, así que el usuario ve «Failed to fetch» o «Error 500». | Los servicios lanzan un error tipado (`ApiError` con status) y la UI lo traduce a textos fijos (sin conexión, no encontrado, datos no válidos, error del servidor). |
| A5 | `uis/talent-pipeline-tracker/app/(app)/page.tsx:32` y `:57` | 9 | `setRecords(response.data)` sin validar: si la API no devuelve `data`, `records.length` y `records.map` lanzan una excepción en el render. | `setRecords(Array.isArray(response?.data) ? response.data : [])`, o validar con un type guard o zod en `getRecords`. |

### Backend

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| A6 | `services/api/app/routers/users.py:41-42` + `services/api/app/services/users.py:29` | 5 | `POST /users` responde 409 con «Ya existe un usuario con el email X»: permite averiguar qué emails están registrados y repite el email en la respuesta (`str(error)`). Ocurre lo mismo en `PUT /users/{id}` (`users.py:70-71`), aunque ahí hace falta estar autenticado. | Responder siempre igual (p. ej. 201/202 con «Revisa tu correo») y avisar por email al titular, o como mínimo usar un `detail` genérico sin el email. |

### Scripts

Ninguno.

---

## MEDIO

### Frontend — backoffice (`uis/backoffice`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| M1 | `lib/account.ts:65`, `lib/suppliers.ts:92`, `lib/incidents.ts:57`, `:62` (`res.blob()`) y `:297` | 1 | `return res.json()` en las respuestas correctas no está protegido: un 200 sin JSON o un cuerpo cortado dan un `SyntaxError` que llega a la UI («Unexpected token <…»). | Envolver el parseo y lanzar `ApiError("Respuesta inesperada del servidor", res.status)`. |
| M2 | `lib/account.ts:37`, `:41`; `lib/suppliers.ts:67-74`, `:79`; `lib/incidents.ts:30`, `:34` | 4 | El mensaje del error es el `detail` del backend o ``Error ${res.status}…``. Suppliers además concatena los errores de Pydantic en inglés (`monthly_rate: Input should be greater than 0`). | Mapear status y códigos a textos en español, como ya hace `lib/incidents.ts:225-266`, y no mostrar el número de status. |
| M3 | `components/LoginForm.tsx:26`, `ForgotPasswordForm.tsx:13`, `ResetPasswordForm.tsx:71`, `RegisterForm.tsx:97,99`, `ChangePasswordForm.tsx:53,57`, `ProfileForm.tsx:25`, `SuppliersDirectory.tsx:27`, `SupplierForm.tsx:74`, `IncidentsAnalyzer.tsx:95,107` | 4 | Todos pintan `e instanceof Error ? e.message : …` tal cual. | Una única función `friendlyError(e)` por status (red, 400/422, 429, 5xx) con un fallback genérico. |
| M4 | `lib/api.ts:21` | 6, 9 | `fetch` sin timeout ni `AbortController`: si la API se cuelga, `loading` y `submitting` se quedan activos para siempre. | `AbortSignal.timeout(15000)` combinado con `init.signal`, y mapear `TimeoutError` a «El servidor tarda demasiado». |
| M5 | `lib/incidents.ts:341-345` (usado en `components/incidents/IncidentsList.tsx:366`), `components/SuppliersDirectory.tsx:36-47` (usado en `:373`, `:390`) | 9 | `Intl.DateTimeFormat().format(new Date(iso))` lanza `RangeError` con una fecha vacía o mal formada y rompe toda la tabla. | Comprobar `Number.isNaN(d.getTime())` y devolver «—». |
| M6 | `components/ProfileForm.tsx:89-97` | 7 | El error de carga del perfil no ofrece «Reintentar» ni ningún enlace. | Botón «Reintentar» con el patrón `reloadKey` de `SuppliersDirectory`. |
| M7 | `lib/auth.ts:4`, `:16` | 5 | El JWT se guarda en `localStorage`, legible ante cualquier XSS. Es una decisión documentada (`AuthGuard.tsx:8`) y el token no aparece en ningún log. | A medio plazo, cookie `HttpOnly; Secure; SameSite`. Mientras tanto, CSP estricta y vida corta del token. |

### Frontend — tracker (`uis/talent-pipeline-tracker`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| M8 | `components/AuthGuard.tsx:38-44` | 2, 3 | `.catch(() => { clearToken(); router.replace("/login"); })` cierra la sesión ante cualquier fallo (red caída, 500) sin explicar por qué. En los 401, `getMe` ya redirige (`lib/authApi.ts:51`). | Distinguir el 401 (cerrar sesión) de red/5xx (mensaje «No se pudo comprobar la sesión» con «Reintentar»). |
| M9 | `services/records.ts:12,20,31`, `services/recordForms.ts:6,18`, `services/notes.ts:6,15,26` | 1 | Ningún `fetch` a la API de 4Geeks captura el `TypeError` de red caída, a diferencia de `lib/authApi.ts:24-31`. | Un `apiFetch()` común con try/catch y mensaje propio de «sin conexión». |
| M10 | `services/records.ts:16,24`, `services/recordForms.ts:14`, `services/notes.ts:10`, `lib/authApi.ts:35,55` | 1, 4 | `res.json()` sin protección. En el login, el `SyntaxError` aparece en pantalla (`components/LoginForm.tsx:52`, `setApiError(e.message)`). | try/catch en el parseo con un mensaje genérico. |
| M11 | `lib/authApi.ts:35-36` + `components/LoginForm.tsx:49-50` | 3, 9 | No se valida `access_token`: si llega vacío se guarda igual, se redirige a `/` y `AuthGuard` devuelve a `/login` sin dar ningún error. | `if (typeof data?.access_token !== "string" \|\| !data.access_token) throw …`. |
| M12 | `app/(app)/candidates/new/page.tsx:13-14` | 9 | `router.push(`/candidates/${created.id}`)` sin comprobar `created.id`: puede navegar a `/candidates/undefined`. | Validar el id; si falta, error controlado o volver al listado. |
| M13 | `services/records.ts:3`, `services/recordForms.ts:3`, `services/notes.ts:3` | 9 | `NEXT_PUBLIC_API_URL` no se valida: sin ella, las peticiones van a `undefined/records` y el error no da ninguna pista. | Comprobarla al cargar el módulo y lanzar un error de configuración claro. |
| M14 | `app/(app)/candidates/[id]/page.tsx:43-49` | 2 | Un mismo catch cubre `patchRecord` y el `getRecordById` posterior: si el PATCH funciona pero falla la recarga, dice «No se han podido guardar los cambios». | Separar los dos pasos: «Cambios guardados; no se pudo refrescar la ficha». |
| M15 | `app/(app)/page.tsx:53`, `[id]/page.tsx:60,90`, `[id]/edit/page.tsx:54`, `components/NotesSection.tsx:101,131`, `components/RecordForm.tsx:123` | 7 | Ningún estado de error ofrece «Reintentar» ni soporte, aunque `loadNotes` ya existe. | Botón «Reintentar» que llame a `load()` o `loadNotes()`, y «Volver al listado» junto al error. |
| M16 | `app/(app)/page.tsx:22-40`, `[id]/page.tsx:22-36`, `[id]/edit/page.tsx:19-41` | 9 | Los efectos de carga no se cancelan: si se cambian los filtros rápido, una respuesta antigua puede sobrescribir la nueva. `NotesSection.tsx:37-54` sí lo hace bien. | Bandera `cancelled` o `AbortController` en el cleanup. |
| M17 | `services/records.ts:20-22` | 6 | `getRecordById` trata el 404 igual que un 500, así que no hay estado «no encontrada». | Si `status === 404`: «Esta candidatura no existe» con enlace al listado. |

### Backend (`services/api`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| M18 | `app/services/incidents.py:91-94`, `:74`, `:113` | 9 | Accesos directos `doc["status"]`, `doc["created_at"]` y `ALLOWED_TRANSITIONS[current]`: un solo registro corrupto en `incidents.json` hace que todo `/summary`, el listado o el cambio de estado devuelvan 500. | Usar `.get()` con fallback y saltar o registrar los documentos inválidos (con su id, no su contenido). |
| M19 | `app/errors.py:101-102` (422 por defecto en auth, users y profiles) | 4, 5 | El 422 de FastAPI incluye `input` con el valor recibido: una contraseña que no cumple la validación (`auth_models.py:30`) vuelve tal cual en la respuesta y puede acabar en logs de proxy o del navegador. | En el handler, eliminar `input` (y `ctx`) de `exc.errors()` antes de responder, en todas las rutas. |
| M20 | `app/routers/incidents.py:40-44` | 9 | `await file.read()` carga el fichero entero en memoria antes de comprobar el límite de 50 MB. | Comprobar el `Content-Length` o leer por bloques y cortar al superar el máximo. |
| M21 | `app/routers/incidents.py:51-55` + `packages/shared/incidents_core/incidents_core/validation.py:20-25` | 1 | Solo se captura `ValueError`. Un `csv.Error` (byte NUL, campo demasiado grande) acaba en un 500 genérico en vez de un 422 con un mensaje útil. | Capturar también `csv.Error` y devolver un 422 con «El CSV está mal formado». |

### Scripts

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| M22 | `scripts/seed_incidents.py:66-67` | 1 | Dos inserciones sin atomicidad ni try: si falla `seed_log.insert`, la incidencia queda sin registrar en el log y la siguiente ejecución la duplica. | try/except que borre la incidencia si falla el log (o al revés) y termine con `return 1`. |
| M23 | `scripts/seed_incidents.py:121-122` | 8 | Devuelve 0 aunque se descarten todas las filas (`inserted == 0`, `existing == 0`, `read > 0`): un pipeline lo daría por bueno. | Devolver un código distinto de 0 (o al menos avisar por stderr) cuando no se inserta ni existía nada. |

---

## BAJO

### Frontend — backoffice (`uis/backoffice`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| B1 | `lib/api.ts:23-27` | 9 | Ante un 401 redirige a `/login` pero devuelve `res`: el llamador lanza `toApiError` y muestra un instante «Error 401…». | Lanzar un `SessionExpiredError` que la UI ignore. |
| B2 | `lib/incidents.ts:258-263`, `:281-282` | 9 | `ALLOWED_TRANSITIONS[e.from].length` con un `from` desconocido lanza un `TypeError` dentro del propio manejador de errores. | Validar con `STATUSES.includes(...)` o usar `?.length`. |
| B3 | `components/incidents/IncidentsList.tsx:325`, `:377` | 9 | `next.length` con un status inesperado rompe la fila y, con ella, toda la lista. | `ALLOWED_TRANSITIONS[incident.status] ?? []`. |
| B4 | `components/SupplierForm.tsx:366` | 4 | «La API rechazó el registro: …» aparece también con errores de red. | Usar el prefijo «No se pudo registrar el proveedor:». |
| B5 | `components/SuppliersDirectory.tsx:61-68`, `:159`, `:211` | 6 | Si falla una recarga, se siguen viendo la tabla y el contador de los filtros anteriores junto al error. | `setSuppliers([])` en el catch, u ocultar la tabla mientras haya `error`. |
| B6 | `components/IncidentsAnalyzer.tsx:179-187` | 7 | El aviso de error no ofrece ninguna acción. | Botón «Reintentar» para la última acción fallida. |
| B7 | `components/ResetPasswordForm.tsx:46` | 5 | El token de reset va en la query: queda en el historial y puede filtrarse por `Referer`. | Limpiarlo con `history.replaceState` tras leerlo y añadir `Referrer-Policy: no-referrer`. |

### Frontend — tracker (`uis/talent-pipeline-tracker`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| B8 | `lib/authApi.ts:18-19` | 5 | El mensaje visible revela infraestructura: «¿Está arrancada en el puerto 8000?». | «No se pudo conectar con el servidor. Inténtalo de nuevo en unos minutos.» |
| B9 | `lib/authApi.ts:5-6`, `components/LoginForm.tsx:12` | 5 | URLs `http://localhost:8000` y `http://localhost:3001/register` hardcodeadas como fallback: en producción fallarían sin avisar. | Pasarlas a `NEXT_PUBLIC_*` y avisar si faltan. |
| B10 | `lib/authApi.ts:34`, `:54` | 4 | ``Error ${res.status} al iniciar sesión.`` muestra el código HTTP. | Textos por caso (429 → «Demasiados intentos», 5xx → genérico). |
| B11 | `components/AuthGuard.tsx:50-55`, `components/LoginForm.tsx:58` | 6 | La comprobación de sesión solo tiene un `sr-only`, así que se ve una página en blanco. | Indicador visible «Comprobando la sesión…». |
| B12 | `services/*.ts` (todos los fetch) | 6 | Sin timeout: el «Cargando…» puede no terminar nunca. | `AbortSignal.timeout(10000)`. |
| B13 | `services/notes.ts:11` | 9 | `data.data ?? []` lanza un `TypeError` si `data` es `null`. | `data?.data ?? []`. |
| B14 | `app/(app)/page.tsx:68`, `[id]/page.tsx:69`, `components/NotesSection.tsx:113` | 9 | `STATUS_LABELS[x]` sin fallback, y `toLocaleDateString()` muestra «Invalid Date». | `?? "Desconocido"` y un `formatDate` que devuelva «—». |
| B15 | `components/LoginForm.tsx:47-54` | 9 | `setSubmitting(false)` solo está en el catch (intencionado): si la navegación no desmonta el formulario, el botón queda deshabilitado. | `finally` con una bandera de «redirigiendo», o dejarlo documentado. |
| B16 | `lib/auth.ts:14-20` | 3 | Si `localStorage` falla, `setToken` lo ignora: el login «funciona» pero devuelve a `/login` sin explicación. | Devolver un boolean y avisar de que el navegador bloquea el almacenamiento. |
| B17 | `lib/auth.ts:16` | 5 | JWT en `localStorage` (igual que M7). | Cookie `HttpOnly` a medio plazo. |

### Backend (`services/api`)

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| B18 | `app/routers/auth.py:94-98` | 9 | `consume_reset_token` marca el token como usado antes de `update_user`: si la escritura falla, el enlace queda gastado y la contraseña sin cambiar. | Marcar el token como usado después de actualizar, dentro del mismo lock, o revertir si falla. |
| B19 | `app/routers/auth.py:74` | 3 | `create_reset_token` va fuera del try: si TinyDB falla, la tarea en segundo plano muere y solo queda el traceback de Starlette, sin contexto. La respuesta al usuario sigue siendo correcta. | Incluirlo en el try y usar `logger.exception` con el `user_id`. |
| B20 | `app/routers/users.py:33`, `suppliers.py:37`, `incidents.py:86` | 4 | Los 404 repiten en el `detail` el id recibido. Es inocuo, pero refleja la entrada del usuario. | `detail` fijo («Usuario no encontrado») y el id solo en los logs. |
| B21 | `app/database.py:39-80` | 9 | Si un JSON de `data/` se corrompe, cada petición falla con un 500 genérico y no hay ningún aviso al arrancar. | Health check que lea las tablas y un log claro de «BD corrupta: <archivo>» (sin contenido). |

### Scripts

| # | Archivo:línea | Cat. | Problema | Corrección sugerida |
|---|---|---|---|---|
| B22 | `scripts/analyze.py:107-112` (igual en `scripts/seed_incidents.py:111-116`) | 1 | Solo se capturan `ValueError` y `UnicodeDecodeError`. `PermissionError`/`OSError` y `csv.Error` salen como traceback (con código 1, pero sin mensaje limpio). | Añadir `OSError` y `csv.Error` al `except`. |
| B23 | `scripts/analyze.py:118-120` | 1 | `output.write_text(...)` sin try: si no hay permisos o el archivo está abierto, sale un traceback. | try/except `OSError` → mensaje por stderr y `return 1`. |
| B24 | `scripts/seed_incidents.py:61-64` | 3 | Los `ValidationError` se suman a «unmapped» sin indicar el motivo: el desglose no cuadra con el total. | Contador propio `validation_failed` en el informe (sin valores del registro). |
| B25 | `services/api/app/seed.py:177-189`, `services/api/app/create_admin.py:28`, `:41` | 1, 9 | Sin manejo de errores de BD ni de validación (salen como traceback). `create_admin` no comprueba lo que devuelve `update_user` y no captura `EmailAlreadyExistsError` en una condición de carrera. | try/except con `sys.exit("mensaje")`. |
| B26 | `skills/data-analysis/scripts/pandas_clean.py:8` | 1 | `pd.read_csv("data.csv")` sin try ni `sys.exit`, a nivel de módulo. Es una plantilla, pero se copiará tal cual. | Envolverlo en `main()` con `FileNotFoundError`/`ParserError` → `sys.exit(1)`. |

---

## Comprobado y correcto

- **Errores no controlados en la API:** el middleware `catch_unhandled_errors` (`services/api/app/errors.py:121-128`) devuelve `{"detail": "Error interno del servidor"}` sin traceback y con cabeceras CORS. El traceback solo va al log del servidor.
- **Login (`auth.py:41-56`):** un único 401 genérico y un hash de relleno, para que el tiempo de respuesta no delate qué emails existen.
- **Forgot-password (`auth.py:83-88`):** siempre 200 con el mismo mensaje y todo el trabajo en segundo plano.
- **Resend (`auth.py:76-80`, `services/email.py`):** el fallo se registra con el `user_id`, sin el enlace ni el token. La API key nunca se loguea. Si falta, solo queda un aviso.
- **JWT (`deps.py:13-33`):** cualquier fallo produce el mismo 401 sin detalle (`raise … from None`).
- **Scripts:** `analyze.py` y `seed_incidents.py` terminan con `sys.exit(main(sys.argv))` y devuelven 1 en sus errores controlados. Sus mensajes nunca incluyen datos de registros (emails).
- **Frontends:** no hay `console.*`, catch vacíos ni `.catch(() => {})` sin comentar. El backoffice envuelve `fetch` ante caídas de red y comprueba `res.ok` en todos sus clientes. Hay estados de carga, vacío y error con «Reintentar» en `SuppliersDirectory`, `IncidentsList` e `IncidentsStats`, y actualización optimista con vuelta atrás en `IncidentRow`. `finally` se usa en la mayoría de los formularios.

## Prioridad recomendada

1. **A6 + A2:** quitar la enumeración de emails en el alta (backend y frontend a la vez).
2. **A1 + A3:** páginas de error y `not-found` en las dos apps.
3. **M1–M3, A4, M9, M10:** un cliente HTTP con parseo seguro, timeout y una única función de mensajes amigables por app.
4. **M18, M19, M21:** robustez del backend ante datos corruptos, `input` en los 422 y `csv.Error`.
5. El resto, por módulo, cuando se toque cada archivo.

> Nota: `uis/talent-pipeline-tracker/` es una entrega cerrada (carpeta protegida). Sus correcciones requieren confirmación explícita antes de aplicarse.
