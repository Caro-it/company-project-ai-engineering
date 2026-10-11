# Progress

_Última actualización: 2026-10-11 · rama `feature/agent-memory-bank`_

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

## En curso / próximos pasos

1. Abrir la PR de `feature/agent-memory-bank` hacia `main` (desde la web de GitHub) con las capturas de website y backoffice.
2. Tras el merge, los pasos manuales de GitHub Pages (abajo).

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
- **`uis/talent-pipeline-tracker` usa `next@16.3.5`.** `npm audit` reporta vulnerabilidades críticas (RCE en `next/og`, SSRF en la optimización de imágenes, cache poisoning…) en el rango 16.0.0–16.3.7; se corrigen en 16.3.8. El tracker está protegido, así que actualizarlo requiere confirmación. El backoffice ya usa 16.3.8.
- `eslint-config-next@16` arrastra `braces` vulnerable (5 avisos *high*, solo en dependencias de desarrollo). `npm audit fix --force` bajaría a `eslint-config-next@14`, así que no se aplica.
- Al pasar Pages a GitHub Actions, la raíz `https://caro-it.github.io/company-project-ai-engineering/` deja de mostrar el README (404). Si se quiere conservar, hay que añadir un `index.html` de redirección en el workflow.
- El README raíz todavía dice que "no existe un `AGENTS.md` en la raíz" (texto del template).

## Pendiente de confirmar con el mentor

- El responsable de Ventas (Megan Clarke o Marcos Ibáñez); ver `projectbrief.md`.
