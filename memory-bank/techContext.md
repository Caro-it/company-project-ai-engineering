# Tech context

## Entorno de trabajo

- Desarrollo local en **Windows con PowerShell 5.1** (sin `&&`; usa `;` o `if ($?) { … }`). Git Bash también está disponible.
- **Todos los archivos en UTF-8 sin BOM.** `Set-Content`/`Add-Content` de PowerShell 5.1 escriben ANSI y `Out-File` añade BOM, así que no se usan para generar archivos del repo.
- Node 22 y npm 10. Python 3.14 (sin uso todavía).
- Gestor de paquetes: **npm**, con un `package-lock.json` por proyecto. **No hay workspace en la raíz**: cada app se instala y ejecuta desde su carpeta o con `npm --prefix <carpeta> …`.
- **Incoherencia conocida:** `.devcontainer/post-create.sh` prepara pnpm (corepack) y ejecuta `uv sync`, pero el repo usa npm y no hay `pyproject.toml`. El devcontainer está protegido y no se toca.

## Apps y puertos

| App | Ruta | Stack | Comando de desarrollo | Puerto |
|---|---|---|---|---|
| Web pública (Hito 1) | `uis/website` | Astro + Tailwind con build real (migración en curso; hasta entonces, HTML estático + Tailwind CDN + JS vanilla) | `npm run dev` | **4321** |
| Backoffice | `uis/backoffice` | Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 | `npm run dev` | **3001** |
| Talent Pipeline Tracker (Hito 3) | `uis/talent-pipeline-tracker` | Next.js 16.3.5 App Router + React 19.2 + TypeScript + Tailwind 4 | `npm run dev` | **3000** (no se toca) |
| Página de pruebas de la lógica (Hito 2) | `packages/shared` | TypeScript 5.9 + `index.html` | `npm run build` y luego `npx http-server . -p 3000 -a 0.0.0.0` | 3000 |

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

- `uis/backoffice` usa el mismo stack que el tracker, con un layout propio de app interna distinto al de la web.
- **Sin backend en este hito.** El backend previsto por el template es una única app FastAPI centralizada en `services/api` (ver `progress.md`).

## Restricciones técnicas

- Los archivos protegidos se listan en [`AGENTS.md`](../AGENTS.md).
- **No hay tests automatizados** en el repo. Las verificaciones disponibles son el `typecheck` de `packages/shared`, el `lint` y `build` de las apps Next.js, el `build` de Astro y el script de literales de `.agents/skills/verify-website-literals`.
- Algunos archivos del tracker se commitearon **con BOM UTF-8**. Como el tracker está protegido, la comprobación de BOM del flujo pre-commit lo excluye.
- `gh` (GitHub CLI) no está instalado en la máquina local; las PR se abren desde la web de GitHub.
