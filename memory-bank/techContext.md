# Tech context

## Entorno de trabajo

- Desarrollo local en **Windows con PowerShell 5.1** (sin `&&`; usa `;` o `if ($?) { … }`). Git Bash también está disponible.
- **Todos los archivos en UTF-8 sin BOM.** `Set-Content`/`Add-Content` de PowerShell 5.1 escriben ANSI y `Out-File` añade BOM, así que no se usan para generar archivos del repo.
- Node 22 y npm 10. Python 3.14 en el sistema; `services/api` usa su propio `.venv` con Python 3.12 (el proyecto exige `>=3.11`).
- Gestor de paquetes JS: **npm**, con un `package-lock.json` por proyecto. **No hay workspace en la raíz**: cada app se instala y ejecuta desde su carpeta o con `npm --prefix <carpeta> …`.
- Gestor de paquetes Python: **uv**, con `pyproject.toml` y `uv.lock` en `services/api`. Las dependencias se añaden con `uv add`, nunca con `pip install`. `requirements.txt` se genera con `uv export`.
- **Incoherencia conocida:** `.devcontainer/post-create.sh` prepara pnpm (corepack) y ejecuta `uv sync` en la raíz, pero el repo usa npm y el único `pyproject.toml` está en `services/api`, no en la raíz. El devcontainer está protegido y no se toca.

## Apps y puertos

| App | Ruta | Stack | Comando de desarrollo | Puerto |
|---|---|---|---|---|
| Web pública (Hito 1) | `uis/website` | Astro 7.3 + Tailwind 4.3 (`@tailwindcss/vite`), salida estática; `public/validation.js` en JS vanilla | `npm run dev` | **4321** |
| Backoffice | `uis/backoffice` | Next.js 16.3.8 App Router (Turbopack) + React 19.2 + TypeScript + Tailwind 4 | `npm run dev` | **3001** |
| Talent Pipeline Tracker (Hito 3) | `uis/talent-pipeline-tracker` | Next.js 16.3.5 App Router + React 19.2 + TypeScript + Tailwind 4 | `npm run dev` | **3000** (no se toca) |
| Página de pruebas de la lógica (Hito 2) | `packages/shared` | TypeScript 5.9 + `index.html` | `npm run build` y luego `npx http-server . -p 3000 -a 0.0.0.0` | 3000 |
| API centralizada | `services/api` | FastAPI 0.143 + Uvicorn + TinyDB + pydantic-settings; auth JWT con python-jose y bcrypt (libpass) | `uvicorn app.main:app --reload --port 8000` (desde `services/api`, con el `.venv` activo) | **8000** |

El devcontainer solo reenvía los puertos 3000, 8000 y 5678. Los puertos 3001 y 4321 hay que reenviarlos a mano en Codespaces.

## Decisiones de arquitectura ya tomadas

### Hito 1 — `uis/website`

- Archivos en inglés: `index.html`, `application.html`, `validation.js`.
- Idioma base: español (`<html lang="es">`).
- Solo clases utilitarias de Tailwind: ni `<style>`, ni `styles.css`, ni `style=`.
- Mobile-first con `sm:`, `md:` y `lg:`; WCAG 2.1 AA.
- JSON-LD `Organization` copiado literalmente de `docs/CONTEXT-hito1-website.md`.
- Publicada con GitHub Pages ("deploy from branch") en `https://caro-it.github.io/company-project-ai-engineering/uis/website/index.html`. PageSpeed móvil: 94 / 100 / 100 / 100.
- Identidad visual (colores usados en el Hito 1):

| Token | Hex | Uso |
|---|---|---|
| navy | `#001D4A` | Hero, footer, logotipo, títulos de tarjeta |
| slate-blue | `#27476E` | Títulos `h2` |
| teal | `#006992` | Enlaces, borde superior de tarjetas, iconos |
| amber | `#ECA400` (hover `#d89400`) | CTA principal |
| foco | `ring-indigo-600` / `ring-indigo-400` sobre fondo oscuro | Estados de foco |

### Hito 2 — `packages/shared` (`@repo/shared-types`)

- Tipos de dominio en `src/types/models.ts`: `Candidato`, `Cliente`, `Proceso`, `Candidatura`, `Sector`, `NivelIngles`, `Disponibilidad`, `LineaServicio`, `Oficina` (`'Valencia' | 'Miami'`), `EstadoProceso` y `EstadoCandidatura`. Los literales salen del formulario del Hito 1.
- Utilidades en `src/utils/`: `collections.ts` (filtrar, ordenar, agrupar), `search.ts` (búsqueda lineal y binaria), `transformations.ts` (conteos y estadísticas de experiencia) y `validations.ts` (reglas de negocio de campo y entidad).
- Verificación con `npm run typecheck` (`tsc --noEmit`).
- **Se consume por ruta relativa** (p. ej. `../../packages/shared/src/types/models`), porque `"main": "index.ts"` apunta a un archivo inexistente (deuda técnica en `progress.md`).

### Hito 3 — `uis/talent-pipeline-tracker`

- Consume la API externa `https://playground.4geeks.com/tracker/api/v1` mediante `NEXT_PUBLIC_API_URL` en `.env.local`.
- Tiene tipos propios en inglés (`types/record.ts`) y etiquetas en español en `lib/labels.ts`. No usa `packages/shared`.
- Tiene su propio `AGENTS.md` (generado por `next dev`) y un `CLAUDE.md` que lo importa. Ambos están protegidos.

### Hito actual

- **`uis/website` migrada a Astro** sin cambiar contenido, ids ni `validation.js`:
  - `build.format: 'file'` mantiene `index.html` y `application.html`.
  - `base` sale de `WEBSITE_BASE`, que solo define el workflow `.github/workflows/deploy-website.yml` (`/company-project-ai-engineering/uis/website`). En local la web vive en `/`.
  - Los enlaces internos pasan por `withBase()` (`src/lib/paths.ts`).
  - Única hoja CSS: `src/styles/global.css`, con `@import "tailwindcss";` (excepción aprobada).
  - Clases adaptadas a Tailwind 4: `outline-none` → `outline-hidden`, `rounded` → `rounded-sm`; los radios y el checkbox usan `accent-[#006992]`.
- **GitHub Pages** pasa a desplegarse con GitHub Actions. El workflow publica `uis/website/dist` en `uis/website/` y `packages/shared/index.html` + `dist/` en `packages/shared/`. La raíz del sitio deja de mostrar el README.
- **`uis/backoffice`**:
  - `turbopack.root` y `outputFileTracingRoot` apuntan a la raíz del monorepo para poder importar `packages/shared` por ruta relativa.
  - Datos del briefing en `lib/nexova.ts`.
  - `suppressHydrationWarning` solo en `<html>` y `<body>` de `app/layout.tsx`, por las extensiones del navegador que alteran esos elementos.
- `uis/website` tiene la dev toolbar de Astro desactivada (`devToolbar: { enabled: false }`).
- En Git Bash, las variables con rutas (`WEBSITE_BASE=/…`) se convierten a rutas de Windows. En local, para probar el base, usa `MSYS_NO_PATHCONV=1` (en PowerShell no pasa).

- `uis/backoffice` usa el mismo stack que el tracker, con un layout propio de app interna distinto al de la web.
- **Gestor de incidencias en `uis/backoffice`:**
  - Rutas `/incidencias` (resumen + listado), `/incidencias/nueva` y `/incidencias/analizador`.
  - Cliente, valores del CONTEXT, etiquetas y diccionario de errores por `code` en `lib/incidents.ts`.
  - Componentes en `components/incidents/`. Los datos se cargan con el patrón "clave de petición": `loading = result.key !== requestKey`, sin `setState` síncrono dentro de `useEffect`, que la regla `react-hooks/set-state-in-effect` de `eslint-config-next` 16 rechaza.
  - Solo en español: no hay soporte bilingüe.
  - **Tests e2e** con Playwright (`npm run test:e2e`, solo Chromium):
    - Arrancan su propia API (puerto 8100, `NEXOVA_DATA_DIR` temporal con el seed, `CORS_ORIGINS` con el puerto 3100) y su propio build en `.next/e2e` (`NEXT_DIST_DIR`).
    - Specs numerados que comparten BD, con `workers: 1`.
    - Las capturas van a `docs/screenshots/incident-manager/`.

### Backend — `services/api`

- **Una única app FastAPI centralizada** (`app/main.py`), con un router por módulo en `app/routers/`: `incidents`, `suppliers`, `auth`, `users` y `profiles`. Documentación interactiva en `http://localhost:8000/docs`.
- **Persistencia con TinyDB** en `services/api/data/` (ignorada por git):
  - `suppliers.json`: directorio de proveedores.
  - `auth.json`: tablas `users` y `profiles`.
  - Las rutas se resuelven con `Path(__file__)`, así que funcionan desde cualquier directorio de arranque.
- La lógica de incidencias vive en `packages/shared/incidents_core` (paquete Python dentro de `packages/shared`, movido con confirmación), instalado en modo editable a través de `[tool.uv.sources]`. `scripts/analyze.py` y `scripts/seed_incidents.py` se ejecutan con el `.venv` de `services/api`.
- **Gestor de incidencias:** `data/incidents.json` con las tablas `incidents` (id uuid4) e `incident_seed_log` (idempotencia del seed). Valores, transiciones y mapas CSV → modelo en `incidents_core/incident_model.py`; modelos Pydantic en `app/incident_models.py` (tipos `Literal` compartidos, no `StrEnum`). Rutas en `app/routers/incidents.py` y acceso a datos en `app/services/incidents.py`.
- **Errores (`app/errors.py`):** en las rutas del gestor de incidencias, los errores de validación son 400 con `{"detail": "Datos no válidos", "code": "validation_error", "errors": [{field, code, message}]}`, filtrando por ruta dentro del handler. Los errores propios (`ApiError`) responden `{"detail", "code", …}`: `not_found` y `invalid_transition` (con `from`, `to` y `allowed`). Soporte bilingüe: `code` es estable y en inglés para que el frontend traduzca, y `message`/`detail` en español es el respaldo. La lista de códigos está en el README de la API. El resto de rutas (incluidas `/api/incidents/analyze` y `/results/export`) conserva el 422 de FastAPI, del que depende el frontend de AUTH-02. Las excepciones no controladas dan 500 con `{"detail": "Error interno del servidor", "code": "internal_error"}` en todas las rutas, y el traceback solo va al log. Las captura el middleware `catch_unhandled_errors`, que `register_error_handlers(app)` registra **antes** de `add_middleware(CORSMiddleware)`: el último middleware añadido es el más externo, así que CORS lo envuelve y el 500 lleva las cabeceras CORS. Si se reordena `main.py`, el navegador vuelve a bloquear los 500.
- **Configuración** con pydantic-settings, leída de `services/api/.env` (ignorado por git; plantilla en `.env.example`). `SECRET_KEY` es obligatoria.
- **Autenticación (AUTH-01):**
  - JWT stateless (HS256, 30 min por defecto) con `sub` = id del usuario.
  - El id de usuario es un uuid4 en string, al que otros módulos se refieren como `user_uuid`.
  - Contraseñas con bcrypt: mínimo 8 caracteres y máximo 72 bytes.
  - Todas las rutas están protegidas salvo `/api/health`, `POST /auth/login` y `POST /users`. El detalle está en el README de la API.
- **Capas:** routers (HTTP y permisos) → `app/services/` (acceso a TinyDB, sin `HTTPException`) → `app/database.py`.
- **Estilo:** docstrings en español, `StrEnum` para los enumerados y `model_config = ConfigDict(extra="forbid")` en los modelos de entrada.
- **Scripts** de `pyproject.toml`: `seed` (datos de ejemplo de proveedores) y `create-admin` (crea o promueve el admin).
- CORS permitido para `localhost:3000` y `localhost:3001`.

## Restricciones técnicas

- Los archivos protegidos se listan en [`AGENTS.md`](../AGENTS.md).
- **No hay tests automatizados** en el repo. Las verificaciones disponibles son el `typecheck` de `packages/shared`, el `lint` y `build` de las apps Next.js, el `build` de Astro y el script de literales de `.agents/skills/verify-website-literals`. `services/api` sí tiene tests (`uv run pytest` desde `services/api`): `pytest` y `httpx2` son dependencias de desarrollo (`[dependency-groups] dev`). `requirements.txt` se genera con `uv export --no-dev` para no incluirlas. Los tests usan TinyDB en memoria y nunca tocan `data/`.
- Algunos archivos del tracker se commitearon **con BOM UTF-8**. Como el tracker está protegido, la comprobación de BOM del flujo pre-commit lo excluye.
- `gh` (GitHub CLI) no está instalado en la máquina local; las PR se abren desde la web de GitHub.
