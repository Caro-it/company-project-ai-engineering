# Backoffice — Nexova Solutions

Aplicación interna de administración de **Nexova Solutions**. Según el README de `uis/`, es el lugar donde irán creciendo las herramientas de los equipos: selección, formación, soporte, ventas, RRHH y dirección. Por ahora ofrece una **pantalla de bienvenida / dashboard vacío** con datos del briefing ([`CONTEXT.md`](../../CONTEXT.md)).

## Qué muestra la ruta `/`

- **Layout propio de app interna**, distinto al de la web pública: barra lateral navy con "Nexova Backoffice", cabecera "Panel interno · Nexova Solutions" y la lista de áreas que llegarán más adelante.
- **La empresa en cifras** (datos de `CONTEXT.md`):
  - 120 empleados, desde 2011.
  - 2 oficinas (Valencia, sede; Miami, oficina de expansión).
  - 3 líneas de servicio.
  - Resolución media en soporte de 48 h, que es **2×** el SLA de 24 h (el cálculo lo hace `excesoSobreSla()`).
- **Pipeline de selección vacío**:
  - Etapas tipadas con `EstadoCandidatura`.
  - Conteo por sector calculado con `contarPorSector()` de `packages/shared` (Hito 2) sobre una lista vacía, a la espera de `services/api`.
- **Áreas y situación de partida**: responsable, equipo y problema principal de cada área según el briefing.
  - El responsable de Ventas **no se muestra** ("—"): el briefing se contradice y está pendiente de confirmar con el mentor (ver `memory-bank/projectbrief.md`).

## Stack

- Next.js **16.3.8** (App Router, Turbopack), React 19.2, TypeScript y Tailwind CSS 4. Es el mismo stack que `uis/talent-pipeline-tracker`, con el parche de seguridad 16.3.8.
- Server Components sin estado cliente; la página se prerenderiza como estática.
- Tipos y lógica de dominio de [`packages/shared`](../../packages/shared/), importados **por ruta relativa** (`../../../packages/shared/src/...`). Para ello `next.config.ts` fija `turbopack.root` en la raíz del monorepo, porque Turbopack no resuelve archivos fuera de su raíz.

## Cómo ejecutarlo

Requisitos: Node ≥ 20.9 y npm.

```bash
cd uis/backoffice
npm install
npm run dev        # http://localhost:3001/
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto **3001** |
| `npm run build` | Build de producción |
| `npm run start` | Sirve la build en el puerto 3001 |
| `npm run lint` | ESLint (`eslint-config-next`) |

No necesita variables de entorno.

## Estructura

```text
uis/backoffice/
├── app/
│   ├── layout.tsx          # <html lang="es">, skip link, barra lateral, cabecera
│   ├── page.tsx            # dashboard de bienvenida
│   └── globals.css         # @import "tailwindcss";
├── components/
│   ├── Sidebar.tsx
│   ├── StatCard.tsx
│   ├── EmptyPipeline.tsx   # usa contarPorSector() de packages/shared
│   └── AreasTable.tsx
├── lib/nexova.ts           # datos de CONTEXT.md tipados con packages/shared
└── next.config.ts          # turbopack.root = raíz del monorepo
```

`AGENTS.md` y `CLAUDE.md` de esta carpeta los genera y mantiene `next dev`, igual que en el tracker. Las instrucciones del monorepo están en el [`AGENTS.md` raíz](../../AGENTS.md).
