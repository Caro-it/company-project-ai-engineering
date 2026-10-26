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

## Gestor de incidencias

Fuente de verdad: [`docs/CONTEXT-incident-manager-nexova.md`](../../docs/CONTEXT-incident-manager-nexova.md). Endpoints y códigos de error: [README de `services/api`](../../services/api/README.md).

| Ruta | Qué ofrece |
|---|---|
| `/incidencias` | Panel de **resumen** (totales por estado, categoría, origen y sede) y **listado** con filtros por estado, origen, sede y categoría. Desde cada fila se cambia el estado, solo a las transiciones permitidas, con actualización optimista: si la API falla, la fila vuelve al estado anterior y se explica el motivo. El resumen y el listado cargan por separado, así que si uno falla el otro sigue funcionando. |
| `/incidencias/nueva` | Formulario de registro: título, descripción, categoría, origen y sede, todos obligatorios. Toda incidencia nace en «Abierta». La sede usa las etiquetas literales del CONTEXT; «Remoto» va en un grupo aparte de las oficinas. Si el origen es «Sede», el campo se resalta con un aviso. |
| `/incidencias/analizador` | El analizador de CSV de siempre (antes en `/incidencias`). |

- **Valores, etiquetas y cliente de la API** en `lib/incidents.ts`. Los valores que se envían a la API son siempre los del CONTEXT; las etiquetas son textos de interfaz.
- **Errores:** la API devuelve un `code` estable y el mensaje se elige en el diccionario de `lib/incidents.ts`. El `message` de la API solo se usa con códigos desconocidos. Los fallos de red y los 500 muestran un mensaje comprensible, nunca texto técnico.
- **Idioma:** todo el backoffice está en español. No hay soporte bilingüe (ver `memory-bank/progress.md`); el diccionario de errores por `code` deja preparado añadirlo.

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

Variable opcional: `NEXT_PUBLIC_API_URL`, la URL de `services/api` (por defecto `http://localhost:8000`). Las pantallas de cuenta, proveedores e incidencias necesitan la API arrancada.

## Estructura

```text
uis/backoffice/
├── app/
│   ├── layout.tsx                  # <html lang="es"> y skip link
│   ├── (auth)/                     # login, registro y recuperación de contraseña
│   ├── (panel)/                    # AuthGuard + Sidebar + cabecera
│   │   ├── page.tsx                # dashboard de bienvenida
│   │   ├── incidencias/            # listado y resumen
│   │   │   ├── nueva/              # formulario de registro
│   │   │   └── analizador/         # analizador de CSV
│   │   ├── proveedores/
│   │   └── account/                # perfil y cambio de contraseña
│   └── globals.css                 # @import "tailwindcss";
├── components/
│   ├── incidents/                  # IncidentForm, IncidentsList, IncidentsStats, IncidentsDashboard
│   ├── IncidentsAnalyzer.tsx
│   ├── SupplierForm.tsx, SuppliersDirectory.tsx
│   ├── AuthGuard.tsx, Sidebar.tsx, NavLink.tsx, LogoutButton.tsx
│   └── …Form.tsx                   # formularios de cuenta
├── lib/
│   ├── api.ts                      # apiFetch: Bearer y 401 → /login
│   ├── auth.ts, account.ts, useTokenStatus.ts
│   ├── incidents.ts                # analizador + gestor de incidencias
│   ├── suppliers.ts
│   └── nexova.ts                   # datos de CONTEXT.md tipados con packages/shared
└── next.config.ts                  # turbopack.root = raíz del monorepo
```

`AGENTS.md` y `CLAUDE.md` de esta carpeta los genera y mantiene `next dev`, igual que en el tracker. Las instrucciones del monorepo están en el [`AGENTS.md` raíz](../../AGENTS.md).
