# Progress

_Última actualización: 2026-10-11 · rama `feature/agent-memory-bank`_

## Hecho

- **Hito 1:** `uis/website` publicada en GitHub Pages. El script de la skill `verify-website-literals` da 58/58 literales correctos.
- **Hito 2:** `packages/shared` con tipos de dominio y utilidades; se verifica con `npm run typecheck`.
- **Hito 3:** `uis/talent-pipeline-tracker` (listado con filtros, búsqueda, detalle con PATCH, notas, alta y edición). Ya está en `main`.
- **Hito actual, Fase 1:** `memory-bank/` (este archivo, `projectbrief.md` y `techContext.md`), `AGENTS.md` raíz, `.agents/rules/` y `.agents/skills/verify-website-literals/`.

## En curso / próximos pasos

1. Reducir el `CLAUDE.md` raíz a `@AGENTS.md`, una vez confirmado el mapa de migración.
2. Sustituir `CONTEXT.es.md` por una línea que remita a `CONTEXT.md` (autorizado).
3. **Fase 2:**
   - Migrar `uis/website` a Astro + Tailwind (puerto 4321), solo después de confirmar el plan de GitHub Pages.
   - Crear `uis/backoffice` con Next.js 16 (puerto 3001) y su README.
4. **Fase 3:** flujo pre-commit completo, arranque de las dos apps, commits pequeños, push y texto de la PR hacia `main`.

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
