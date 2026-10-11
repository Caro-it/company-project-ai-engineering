# Progress

_Última actualización: 2026-10-11 · rama `feature/agent-memory-bank`_

## Hecho

- **Hito 1:** `uis/website` publicada en GitHub Pages. El script de la skill `verify-website-literals` da 58/58 literales correctos.
- **Hito 2:** `packages/shared` con tipos de dominio y utilidades; se verifica con `npm run typecheck`.
- **Hito 3:** `uis/talent-pipeline-tracker` (listado con filtros, búsqueda, detalle con PATCH, notas, alta y edición). Ya está en `main`.
- **Hito actual, Fase 1:** `memory-bank/`, `AGENTS.md` raíz, `CLAUDE.md` reducido a `@AGENTS.md`, `.agents/rules/` (`website`, que aplica por patrón de archivo, y `nexova-domain`, siempre activa), la skill `.agents/skills/verify-website-literals/` y `CONTEXT.es.md` reducido a una línea que remite a `CONTEXT.md`.

## En curso / próximos pasos

1. **Fase 2:**
   - Migrar `uis/website` a Astro + Tailwind 4 (puerto 4321, `base` solo en el build de despliegue) y añadir el workflow de GitHub Pages.
   - Crear `uis/backoffice` con Next.js 16 (puerto 3001) y su README.
2. **Fase 3:** flujo pre-commit completo, arranque de las dos apps, commits pequeños, push y texto de la PR hacia `main`.

## Pasos manuales al hacer merge a `main` (GitHub Pages)

Los hace la usuaria; el agente no toca la configuración de GitHub.

1. Hacer merge de la PR a `main`.
2. En GitHub, ir a **Settings → Pages → Build and deployment → Source** y elegir **"GitHub Actions"** en lugar de "Deploy from a branch".
3. En **Actions**, lanzar a mano el workflow **"Deploy website to GitHub Pages"** (*Run workflow* sobre `main`) o esperar a que se ejecute con el push del merge.
4. Comprobar que siguen respondiendo:
   - https://caro-it.github.io/company-project-ai-engineering/uis/website/index.html
   - https://caro-it.github.io/company-project-ai-engineering/uis/website/application.html
   - https://caro-it.github.io/company-project-ai-engineering/packages/shared/index.html
5. Volver a pasar PageSpeed Insights (móvil) y actualizar las cifras del README raíz si cambian.

## Pospuesto

- **`services/api` (FastAPI centralizado) queda para el hito de backend.** En este hito no hay backend.

## Deuda técnica conocida

- `packages/shared/package.json` declara `"main": "index.ts"` y `"types": "index.ts"`, pero **ese `index.ts` no existe** en la raíz del paquete (solo existe `types/index.ts`, que es el placeholder del template). Por eso los tipos se importan por ruta relativa. `packages/shared/` está protegido.
- El devcontainer prepara pnpm y uv; el repo usa npm (ver `techContext.md`).
- Hay archivos de `uis/talent-pipeline-tracker` con BOM UTF-8 (protegido).
- La web del Hito 1 carga Tailwind por CDN (`cdn.tailwindcss.com`), que no está pensado para producción. Se resuelve con la migración a Astro.
- El README raíz todavía dice que "no existe un `AGENTS.md` en la raíz" (texto del template).

## Pendiente de confirmar con el mentor

- El responsable de Ventas (Megan Clarke o Marcos Ibáñez); ver `projectbrief.md`.
