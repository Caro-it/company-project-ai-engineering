# Progress

_Última actualización: 2026-10-25 · rama `feature/auth-api`_

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

## En curso / próximos pasos

- **AUTH-01:** abrir la PR de `feature/auth-api` hacia `main`.
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
  - El `Lock` que garantiza el email único solo protege dentro de un proceso. Con varios workers de uvicorn, TinyDB no es seguro: habrá que pasar a una base de datos real.
  - `services/api` no tiene tests automatizados. `fastapi.testclient` (que reexporta el de Starlette 1.8) necesita `httpx2`; acepta `httpx` como alternativa obsoleta, con aviso de deprecación. Ninguno de los dos está instalado.

## Pendiente de confirmar con el mentor

- El responsable de Ventas (Megan Clarke o Marcos Ibáñez); ver `projectbrief.md`.
