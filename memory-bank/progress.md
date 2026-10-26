# Progress

_Última actualización: 2026-10-26 · rama `feature/incident-manager`_

## Hecho

- **Hito 1:** `uis/website` publicada en GitHub Pages. El script de la skill `verify-website-literals` da 58/58 literales correctos.
- **Hito 2:** `packages/shared` con tipos de dominio y utilidades; se verifica con `npm run typecheck`.
- **Hito 3:** `uis/talent-pipeline-tracker` (listado con filtros, búsqueda, detalle con PATCH, notas, alta y edición). Ya está en `main`.
- **Hito actual, Fase 1:** `memory-bank/`, `AGENTS.md` raíz, `CLAUDE.md` reducido a `@AGENTS.md`, `.agents/rules/` (`website`, que aplica por patrón de archivo, y `nexova-domain`, siempre activa), la skill `.agents/skills/verify-website-literals/` y `CONTEXT.es.md` reducido a una línea que remite a `CONTEXT.md`.

- **Hito actual, Fase 2:**
  - `uis/website` en Astro con componentes reutilizables. Da 58/58 literales en las builds local y con base de Pages. Dev toolbar de Astro desactivada.
  - `.github/workflows/deploy-website.yml`.
  - `uis/backoffice` en Next.js 16.3.8, con su dashboard de bienvenida y su README. `suppressHydrationWarning` solo en `<html>` y `<body>`: el aviso de hidratación lo provocaba una extensión del navegador (en incógnito no aparece).
  - Tabla de apps en `uis/README`.
- **Hito actual, Fase 3:**
  - Flujo pre-commit de `AGENTS.md` ejecutado antes de cada commit, sin fallos.
  - Website (4321) y backoffice (3001) arrancados con `npm run dev`: responden 200 y no hay errores en la consola del servidor.
  - Commits `feat:`/`chore:`/`docs:` subidos a `feature/agent-memory-bank`.
  - PR #3 (`feature/agent-memory-bank`) mergeada en `main` el 2026-10-16.
  - GitHub Pages se despliega con GitHub Actions (Settings → Pages → Source: "GitHub Actions").
- **Backend `services/api`, ticket AUTH-01 (autenticación JWT stateless), rama `feature/auth-api`:**
  - Configuración con pydantic-settings desde `services/api/.env` (`SECRET_KEY` obligatoria) y `.env.example`.
  - Contraseñas con bcrypt (libpass) y tokens JWT con python-jose (`sub` = id del usuario, `exp`).
  - Usuarios y perfiles en TinyDB, en `data/auth.json`, separados de `data/suppliers.json`. El id de usuario es un uuid4 en string, al que otros módulos se refieren como `user_uuid`.
  - Capa de servicios en `app/services/` (`users.py`, `profiles.py`), sin `HTTPException`.
  - Routers `/auth` (login y `me`), `/users` y `/profiles/me`. `incidents` y `suppliers` quedan protegidos; `/api/health` sigue siendo pública.
  - `GET /users` es solo para admin. En `/users/{id}` el permiso (propio o admin) se comprueba antes que la existencia: 403, nunca 404, para un no-admin.
  - Script `create-admin` (`app/create_admin.py`) para crear el primer admin o promover y reactivar uno existente.
  - Sección "Autenticación" en `services/api/README.md`: variables, admin inicial, flujo en `/docs`, rutas, errores y limitaciones.
  - Verificado a mano levantando uvicorn en proceso con TinyDB en memoria: 40 comprobaciones de rutas y códigos de estado, y los casos de `create-admin`.
  - PR #7 (`feature/auth-api`) mergeada en `main` el 2026-10-25.
- **Frontend `uis/backoffice`, ticket AUTH-02 (login, registro y perfil contra la API), rama `feature/auth-frontend` (creada desde `feature/auth-api`):**
  - Route groups: `app/layout.tsx` solo con `<html>`, `<body>` y el skip-link; `app/(panel)/layout.tsx` con `AuthGuard`, `Sidebar` y cabecera; `app/(auth)/layout.tsx` para login y registro. Inicio, `incidencias/` y `proveedores/` se movieron a `(panel)` sin cambiar sus URLs.
  - Token en `localStorage` (clave `nexova_token`) con `getToken`/`setToken`/`clearToken` e `isTokenValid()` en `lib/auth.ts`.
  - `AuthGuard` en cliente (sin middleware de Next): no pinta el panel hasta comprobar el token y, si no es válido, hace `router.replace("/login")`. El estado del token se lee con `useSyncExternalStore` (`lib/useTokenStatus.ts`).
  - `apiFetch` (`lib/api.ts`) añade `Authorization: Bearer <token>`. Ante un 401 fuera de `/auth/login`, borra el token y redirige a `/login`. `lib/incidents.ts` y `lib/suppliers.ts` lo usan sin cambiar sus mensajes de error; `API_URL` pasa a `lib/api.ts`.
  - Cliente de auth, usuarios y perfil en `lib/account.ts`. El login va en form-urlencoded (`username` = email).
  - `/login` y `/register` accesibles (`label`, `aria-invalid`, errores en `role="alert"`). El registro hace `POST /users` y después login con las mismas credenciales. Los 422 se muestran por campo y el 409 en el campo email. Con un token válido, ambas páginas redirigen a `/`.
  - `/account/profile`: email en solo lectura (`GET /auth/me`) y nombre, teléfono y dirección con `PUT /profiles/me`. Un campo vacío se envía como `null` para vaciarlo.
  - Sidebar con enlace "Mi perfil" y `LogoutButton` (`clearToken` + `router.replace("/login")`).
  - `npm run lint` y `npm run build` sin errores. Verificado a mano contra services/api: redirección sin sesión, validación del registro (contraseña corta y email duplicado), registro + login automático, proveedores e incidencias con Bearer, perfil, token manipulado → /login, logout y login fallido.
  - `uis/website` (Astro) no se toca: es pública y no tiene autenticación.
- **Frontend `uis/talent-pipeline-tracker`, ticket AUTH-02 (login y rutas protegidas), misma rama, con confirmación explícita para tocar la carpeta protegida:**
  - Protección contra la API de Nexova (`NEXT_PUBLIC_AUTH_API_URL`, por defecto `http://localhost:8000`, documentada en el README). Las llamadas a la API de 4Geeks (`services/records.ts` y `services/notes.ts`) no cambian y no llevan el token.
  - `lib/auth.ts` y `lib/useTokenStatus.ts` copiados del backoffice (misma clave `nexova_token`; cada origen tiene su propio `localStorage`, así que el tracker tiene su propio `/login`). `lib/authApi.ts` con `login()` y `getMe()`; un 401 en `getMe()` borra el token y redirige a `/login`.
  - `AuthGuard` en cliente: comprueba `exp` en local y lo confirma con una sola llamada a `GET /auth/me`, cuyo resultado comparte con la cabecera mediante `useMe()`. Si algo falla, borra el token y manda a `/login`.
  - Route groups: `app/(app)/layout.tsx` con `AuthGuard` y una cabecera con el email del usuario y `LogoutButton`; inicio y `candidates/` se movieron a `(app)` sin cambiar sus URLs. `/login` en `app/(auth)/login`, con enlace al registro del backoffice (`http://localhost:3001/register`).
  - Verificado a mano contra services/api: redirección sin sesión, login fallido con mensaje genérico, login correcto con listado, detalle, nueva y editar, token manipulado → /login, logout y enlace al registro del backoffice.
- **Ticket AUTH-03 (recuperación y cambio de contraseña), rama `feature/password-reset`:**
  - API:
    - Variables `RESEND_API_KEY` (opcional: sin ella no se envía nada y queda un aviso en los logs), `EMAIL_FROM` (por defecto `onboarding@resend.dev`), `FRONTEND_URL` (por defecto `http://localhost:3001`) y `RESET_TOKEN_EXPIRE_MINUTES` (30). Documentadas en `.env.example` y en el README.
    - Tabla `password_reset_tokens` en `auth.json`, con `user_id`, `token_hash` (sha256), `expires_at` y `used_at`. Su acceso está en `app/services/password_reset.py`. El email (HTML y texto) se envía con el SDK de resend desde `app/services/email.py`.
    - `POST /auth/forgot-password` responde siempre 200 con el mismo mensaje. La búsqueda del usuario, el token y el envío van en `BackgroundTasks`, para que el tiempo de respuesta no delate si el email existe. Pedir un enlace invalida los anteriores, y los usuarios desactivados no reciben enlace.
    - `POST /auth/reset-password`: 400 si el token no existe, ha caducado o ya se usó.
    - `POST /auth/change-password`: protegida. 400 si la contraseña actual no es correcta, e invalida los enlaces pendientes.
  - Backoffice:
    - `forgotPassword`, `resetPassword` y `changePassword` en `lib/account.ts`, no en `lib/auth.ts`, para evitar el ciclo `auth → account → api → auth`.
    - Páginas `/forgot-password`, `/reset-password` (con `useSearchParams` dentro de `<Suspense>`) y `/account/change-password`, con su enlace en el Sidebar.
    - El login enlaza a "¿Olvidaste tu contraseña?" y muestra un aviso con `?reset=ok`: la página lee `searchParams`, así que `/login` pasa a ser dinámica.
  - `npm run lint` y `npm run build` del backoffice sin errores. La API arranca con uvicorn. 22 comprobaciones de los tres endpoints en proceso, con TinyDB en memoria y el envío sustituido, y 10 con Invoke-RestMethod contra la API arrancada con uv.
  - Prueba manual de extremo a extremo correcta (2026-10-26):
    - email real recibido en la cuenta de Resend;
    - el token anterior queda invalidado al pedir uno nuevo;
    - reset por enlace, token de un solo uso y reset sin token;
    - login con la contraseña nueva;
    - change-password con sus validaciones;
    - forgot-password sin `RESEND_API_KEY`: 200 y aviso en los logs.
  - PR #9 (`feature/password-reset`) mergeada en `main`.

## En curso / próximos pasos

- **Gestor de Incidencias Centralizado, rama `feature/incident-manager`.** Fuente de verdad: `docs/CONTEXT-incident-manager-nexova.md`.
  - Fase 1 (capa de datos y seed) hecha, en dos commits (`refactor(shared)` y `feat(incidents)`), sin push:
    - `packages/incidents_core` movido a `packages/shared/incidents_core` con `git mv`, con confirmación explícita. `pyproject.toml`, `uv.lock` y `requirements.txt` actualizados; este último estaba desactualizado desde AUTH-03 (le faltaba `resend`). `analyze.py` sigue dando 100 / 96 / 4 y la API arranca.
    - `incidents_core/incident_model.py`: `Literal` y diccionarios valor → etiqueta (`STATUSES`, `ORIGINS`, `CATEGORIES`, `BRANCHES`), `ALLOWED_TRANSITIONS`, mapas CSV → modelo, `MAPPING_ERRORS` y `csv_row_to_incident()`.
    - `app/incident_models.py` (`IncidentCreate` sin status ni fechas, `Incident`) y `data/incidents.json` con las tablas `incidents` e `incident_seed_log`.
    - `scripts/seed_incidents.py`: idempotente por `ticket_id`, que se guarda en `incident_seed_log` y no en la incidencia. El informe solo muestra contadores y etiquetas.
    - Verificado sobre una TinyDB temporal (no la de desarrollo): open 27, resolved 56, discarded 13; technical_failure 49, process_error 35, client_complaint 12. La segunda ejecución inserta 0 y la salida no contiene emails.
  - Fase 2 (endpoints en `services/api`) hecha, en el commit `feat(incidents): add incident management endpoints and error handling`, sin push:
    - `app/services/incidents.py`: alta (siempre en `open`, uuid4, fechas UTC), listado con filtros y más recientes primero, detalle, `incidents_summary()` (todas las claves aunque valgan 0) y `change_status()` con `ALLOWED_TRANSITIONS`, `InvalidTransitionError` y un `Lock`.
    - Rutas en `app/routers/incidents.py`: `POST`/`GET /api/incidents`, `GET /summary` (declarada antes que `/{incident_id}`), `GET /{incident_id}` y `PATCH /{incident_id}/status`. `/analyze` y `/results/export` no cambian.
    - `app/errors.py`: los errores de validación de las rutas del gestor son 400 con `{"detail": "Datos no válidos", "code": "validation_error", "errors": [{field, code, message}]}` y mensajes en español. Por el soporte bilingüe, cada error lleva un `code` estable en inglés (`required`, `invalid_choice` con `allowed`, `empty_text`, `extra_field_not_allowed`, `invalid_json`…). Los errores propios usan `ApiError`: `not_found` e `invalid_transition` (con `from`, `to` y `allowed`). El resto de rutas, incluidas `/analyze` y `/results/export`, conserva el 422 de FastAPI. Cualquier excepción no controlada da 500 con mensaje genérico, de forma global. La captura un middleware HTTP registrado antes de `CORSMiddleware`, que queda por dentro de CORS: el 500 lleva `access-control-allow-origin` y el frontend puede leerlo. El traceback va al log con `logger.exception`, y el handler de `Exception` se mantiene como red de seguridad.
    - Verificado con `TestClient` y TinyDB en memoria, sin tocar `services/api/data/`: 33 casos correctos, comprobando también el `code` de cada error. Entre ellos: validación 400 por campo, lista y summary vacíos, summary tras el seed (27/56/13, 49/35/12, customer 96, central 96), filtros, 404, transiciones válidas e inválidas, 401, 500 sin traceback y con `access-control-allow-origin` para el origen del backoffice, y los 422 de `/users`, `/auth/login`, `/profiles/me` y `/analyze`. Ninguna respuesta contiene `customer_email` ni emails.
  - Fase 3 (frontend en `uis/backoffice`):
    - **Decisión: sin soporte bilingüe.** El CONTEXT pide respetarlo "si has implementado soporte bilingüe en hitos anteriores", y no existe en ningún app ni rama del repo. Todo el gestor está en español, como el resto del backoffice. Los errores de la API se traducen por `code` en un único diccionario en español (`lib/incidents.ts`), para que el bilingüe se pueda añadir en el futuro sin tocar la API. No hay selector de idioma ni hook de locale.
    - Rutas:
      - `/incidencias`: panel de resumen encima del listado (decisión de la usuaria), cada uno con su propia carga y su propio error.
      - `/incidencias/nueva`: formulario.
      - `/incidencias/analizador`: el analizador de CSV, movido con `git mv` sin tocar `IncidentsAnalyzer`.
      - El Sidebar tiene una entrada para cada una.
    - `lib/incidents.ts`: valores del CONTEXT (copia de `incident_model.py`), etiquetas de interfaz, `BRANCH_LABELS` literales, `IncidentApiError`, diccionario de errores por `code` y cliente de los endpoints.
    - `components/incidents/`:
      - `IncidentForm`: obligatorios en cliente, `branch` resaltada con `origin = branch`, `remote` en un `optgroup` aparte, `aria-busy`, errores junto a su campo y confirmación con `role="status"`.
      - `IncidentsStats`: resumen.
      - `IncidentsList`: filtros, estados de carga, error, vacío y vacío por filtros, y cambio de estado optimista con reversión.
      - `IncidentsDashboard`: recarga el resumen tras un cambio de estado.
    - `npm run lint`, `npx tsc --noEmit` y `npm run build` sin errores.
    - Seed ejecutado en la BD de desarrollo (`services/api/data/incidents.json`, 96 incidencias), con autorización de la usuaria.
  - Tests del backend en `services/api/tests/` (`uv run pytest`): 43 tests que pasan, con TinyDB en memoria. `pytest` y `httpx2` como dependencias de desarrollo.
  - **Fallo de concurrencia en TinyDB, corregido** (lo destaparon los tests e2e):
    - `/incidencias` pide el listado y el resumen a la vez. FastAPI ejecuta los endpoints síncronos en un pool de hilos, y `JSONStorage` de TinyDB comparte un único descriptor de archivo: las lecturas simultáneas se movían el cursor y fallaban con `JSONDecodeError` → 500 (23 de 200 peticiones concurrentes). Afectaba también a `auth.json` en la autenticación de cada petición.
    - Arreglo: `LockedJSONStorage` en `app/database.py`, con un lock por archivo en `read`/`write`. Tras el arreglo, 600 de 600 peticiones correctas. El test `tests/test_database.py` lo cubre: sin lock fallan 212 de 400 lecturas.
  - Tests e2e del backoffice con Playwright (`npm run test:e2e`): 16 tests que pasan (1 de setup + 15), estables en ejecuciones repetidas.
    - Usan su propia API (puerto 8100) con BD temporal y seed, y su propio build (`.next/e2e`, puerto 3100).
    - La API gana dos variables opcionales para ello: `NEXOVA_DATA_DIR` y `CORS_ORIGINS`.
    - Capturas en `docs/screenshots/incident-manager/`.

- **GitHub Pages (sin confirmar si ya se hizo):**
  1. Comprobar que siguen respondiendo:
     - https://caro-it.github.io/company-project-ai-engineering/uis/website/index.html
     - https://caro-it.github.io/company-project-ai-engineering/uis/website/application.html
     - https://caro-it.github.io/company-project-ai-engineering/packages/shared/index.html
  2. Volver a pasar PageSpeed Insights (móvil) y actualizar las cifras del README raíz si cambian.

## Pospuesto

- Nada pospuesto por ahora. `services/api` ya está en marcha (incidencias, proveedores y autenticación).

## Deuda técnica conocida

- `packages/shared/package.json` declara `"main": "index.ts"` y `"types": "index.ts"`, pero **ese `index.ts` no existe** en la raíz del paquete (solo existe `types/index.ts`, que es el placeholder del template). Por eso los tipos se importan por ruta relativa. `packages/shared/` está protegido.
- El devcontainer prepara pnpm y uv; el repo usa npm (ver `techContext.md`).
- Hay archivos de `uis/talent-pipeline-tracker` con BOM UTF-8 (protegido).
- **`uis/talent-pipeline-tracker` usa `next@16.3.5`.** `npm audit` reporta vulnerabilidades críticas (RCE en `next/og`, SSRF en la optimización de imágenes, cache poisoning…) en el rango 16.0.0–16.3.7; se corrigen en 16.3.8. El tracker está protegido, así que actualizarlo requiere confirmación. El backoffice ya usa 16.3.8.
- `eslint-config-next@16` arrastra `braces` vulnerable (5 avisos *high*, solo en dependencias de desarrollo). `npm audit fix --force` bajaría a `eslint-config-next@14`, así que no se aplica.
- Al pasar Pages a GitHub Actions, la raíz `https://caro-it.github.io/company-project-ai-engineering/` deja de mostrar el README (404). Si se quiere conservar, hay que añadir un `index.html` de redirección en el workflow.
- El README raíz todavía dice que "no existe un `AGENTS.md` en la raíz" (texto del template).
- **AUTH-01:**
  - Un admin puede quitarse su propio rol o desactivarse, y la API puede quedarse sin admin. Se recupera con `create-admin` (documentado en el README de la API).
  - Los JWT no se pueden revocar antes de que caduquen. Desactivar o borrar un usuario sí invalida sus tokens.
  - El `Lock` que garantiza el email único, y el de `LockedJSONStorage`, solo protegen dentro de un proceso. Con varios workers de uvicorn, TinyDB no es seguro: habrá que pasar a una base de datos real.
  - Los tests de `services/api` (pytest) cubren solo el gestor de incidencias y el seed. Auth, usuarios, perfiles y proveedores siguen sin tests automatizados.
- **AUTH-02:**
  - `isTokenValid()` no verifica la firma del JWT: solo decodifica `exp`. Sirve para no mostrar el panel con un token caducado, pero cualquier token con un `exp` futuro pasa el `AuthGuard`. La validación real la hace la API, y su 401 hace que `apiFetch` cierre la sesión.

- **AUTH-03:**
  - Restablecer o cambiar la contraseña no invalida los JWT ya emitidos: siguen valiendo hasta que caducan.
  - Con el remitente `onboarding@resend.dev`, Resend solo entrega al email de la cuenta de Resend. Para otros destinatarios hace falta verificar un dominio.
  - No hay límite de peticiones en `forgot-password`.
- `uis/backoffice/lib/incidents.ts` copia los valores y `ALLOWED_TRANSITIONS` de `incidents_core/incident_model.py`. Si cambian en Python, hay que cambiarlos a mano en el backoffice.
- Los títulos de pestaña (`metadata`) y todo el backoffice están solo en español; ver la decisión sobre el soporte bilingüe en la fase 3 del gestor.
- **Gestor de incidencias:**
  - `scripts/analyze.py` falla en la consola de Windows (cp1252) al imprimir `├─`. Funciona con `PYTHONIOENCODING=utf-8` o `python -X utf8`. El seed solo imprime ASCII.
  - El seed inserta la incidencia y después su entrada en `incident_seed_log`, sin transacción. Si se corta entre las dos, la siguiente ejecución duplicaría esa incidencia.
  - Ninguna descripción del CSV supera 120 caracteres (la más larga tiene 54), así que el truncado del título no se ejercita con los datos reales.

## Pendiente de confirmar con el mentor

- El responsable de Ventas (Megan Clarke o Marcos Ibáñez); ver `projectbrief.md`.
- Las etiquetas para mostrar de estados, orígenes y categorías del gestor de incidencias; ver `projectbrief.md`.
