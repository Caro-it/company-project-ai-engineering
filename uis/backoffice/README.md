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

## Inventario de activos (Hito 5)

Fuente de verdad: [`docs/CONTEXT-inventory-nexova.md`](../../docs/CONTEXT-inventory-nexova.md) (ticket NXV-0201). Consume la API `/inventory` de `services/api`: hay que tenerla arrancada y con una sesión iniciada.

| Ruta | Qué ofrece |
|---|---|
| `/inventory/products` | **Stock de activos**: nombre, SKU, categoría, oficina y `current_stock`, con un indicador de nivel (color, icono y texto). Cada fila enlaza a «+ Entrada» y «− Salida» con el activo ya elegido (`?asset_id=`). |
| `/inventory/orders/inbound` | **Entrada de activos**: activo (elegido por nombre, SKU y oficina), cantidad recibida y proveedor. La oficina receptora es la del activo. Tras el alta se limpia el formulario y se confirma. |
| `/inventory/orders/outbound` | **Salida de activos**: el stock disponible se consulta a `GET /inventory/products/{id}` cada vez que cambia el activo, antes de escribir la cantidad. Si la cantidad lo supera, aparece un aviso (no bloquea: la regla real la aplica la API). El `400` «Insufficient stock…» se muestra junto al campo cantidad. «Asignado a» solo aparece, y es obligatorio, en las asignaciones; en un consumo se envía `null`. |
| `/inventory/orders` | **Historial de órdenes**, de solo lectura: tipo (entrada en verde ↓ / salida en azul ↑), activo, cantidad, oficina, proveedor o asignación, fecha y `user_uuid`. |

- **Una sola capa de API:** `lib/inventory.ts` hace todas las llamadas a `/inventory`; los componentes nunca usan `fetch`. Reutiliza `apiFetch`, así que envía `Authorization: Bearer <nexova_token>` y, ante un 401, vuelve a `/login`. Los tipos de `types/inventory.ts` reflejan `services/api/app/schemas.py`.
- **Protección:** las cuatro páginas están en el route group `(panel)`, detrás de `AuthGuard`, igual que el resto del backoffice.
- **Errores:** los `400` de negocio muestran el `detail` de la API, porque es un mensaje redactado para el usuario; es la única excepción a la regla de no mostrar el `detail`. Los `422` dicen qué campos revisar, con sus etiquetas en español. El resto (401, 404, 409, 5xx, red y timeout) usa los textos fijos de `lib/api.ts`. Nada se queda solo en la consola.
- **Umbrales de stock** (`lib/inventory.ts`): hasta 5 uds., «Stock bajo» en rojo (o «Agotado» con 0); hasta 15 uds., «Stock justo» en ámbar; por encima, «Stock correcto» en verde.
- **Etiquetas:** Activo, Entrada de activos, Salida de activos, Asignación a empleado y Consumo, según el BRIEFING. Los valores que se envían a la API son los del CONTEXT (`allocation`, `consumption`, `Valencia`, `Miami`…).

## Tests end-to-end

Playwright (`@playwright/test`, dependencia de desarrollo), solo con Chromium. La primera vez hay que instalar el navegador:

```bash
cd uis/backoffice
npx playwright install chromium
npm run test:e2e
```

Requisitos: `uv` en el PATH (arranca `services/api` con su entorno).

- **Entorno propio, sin tocar el de desarrollo.** `e2e/start-api.mjs` arranca la API en el puerto **8100** con `NEXOVA_DATA_DIR` apuntando a una carpeta temporal del sistema. La borra en cada ejecución, la rellena con el seed (96 incidencias) y nunca usa `services/api/data/`.
- **Inventario sin Supabase.** `DATABASE_URL` apunta a un SQLite de esa misma carpeta (`e2e-inventory.db`); las variables del proceso tienen prioridad sobre `services/api/.env`. Antes de arrancar se crea un admin de test y se ejecuta `seed-inventory` (6 activos, 5 entradas y 3 salidas). El backoffice se construye en `.next/e2e` (`NEXT_DIST_DIR`) y se sirve en el puerto **3100**, así que no pisa el build normal ni choca con `npm run dev`.
- **Sesión:** `e2e/auth.setup.ts` crea un usuario de test y entra por el formulario de login real. El token se reutiliza en todos los specs (`e2e/.auth/`, ignorada por git).
- **Specs, en orden y con un solo worker** (comparten la BD):
  - `01-resumen`: totales del seed, y el listado sigue funcionando si `/summary` falla.
  - `02-listado`: datos, filtros, vacío por filtros, error con reintentar, cambio de estado válido y cambio fallido que se revierte.
  - `03-formulario`: obligatorios, resaltado de la sede con origen «Sede», botón deshabilitado y `aria-busy` con una respuesta lenta, 400 junto a su campo, 500, error de red y alta correcta.
  - `04-analizador`: el analizador de CSV en `/incidencias/analizador`.
  - `05-inventario`: redirección al login de las cuatro rutas sin sesión, stock del seed con su nivel, stock reactivo en la salida, aviso en cliente, `400` de stock insuficiente junto a la cantidad, `422` legible, «Asignado a» solo en asignaciones, alta de entrada y de salida, historial y error con reintento. Sus capturas van a [`docs/screenshots/inventory-backoffice/`](../../docs/screenshots/inventory-backoffice/).
- **Errores simulados:** se hacen con `page.route` (`e2e/helpers.ts`). Las respuestas simuladas llevan cabeceras CORS, porque la API está en otro origen.
- **Capturas:** se regeneran en cada ejecución en [`docs/screenshots/incident-manager/`](../../docs/screenshots/incident-manager/): `formulario-error-validacion.png`, `listado.png` y `resumen-metricas.png`.
- `tsconfig.json` incluye `.next/e2e/types/**/*.ts`. Si no estuviera, `next build` lo añadiría y reformatearía el archivo en cada ejecución.

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
| `npm run test:e2e` | Tests end-to-end del gestor de incidencias y del inventario con Playwright (Chromium) |
| `npm test` | Tests unitarios de `lib/` con Jest |

Variables opcionales (ver [`.env.example`](./.env.example); cópialo como `.env.local`, que git ignora):

- `NEXT_PUBLIC_API_URL`: la URL de `services/api` (por defecto `http://localhost:8000`).
- `NEXT_PUBLIC_INVENTORY_API_URL`: la URL de la API de inventario. Si no se define, se usa `NEXT_PUBLIC_API_URL`.

Las pantallas de cuenta, proveedores, incidencias e inventario necesitan la API arrancada.

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
│   │   ├── inventory/              # products, orders (historial), orders/inbound, orders/outbound
│   │   └── account/                # perfil y cambio de contraseña
│   └── globals.css                 # @import "tailwindcss";
├── components/
│   ├── incidents/                  # IncidentForm, IncidentsList, IncidentsStats, IncidentsDashboard
│   ├── IncidentsAnalyzer.tsx
│   ├── inventory/                  # AssetsTable, StockBadge, Inbound/OutboundOrderForm, OrdersHistory
│   ├── SupplierForm.tsx, SuppliersDirectory.tsx
│   ├── AuthGuard.tsx, Sidebar.tsx, NavLink.tsx, LogoutButton.tsx
│   └── …Form.tsx                   # formularios de cuenta
├── lib/
│   ├── api.ts                      # apiFetch: Bearer y 401 → /login
│   ├── auth.ts, account.ts, useTokenStatus.ts
│   ├── incidents.ts                # analizador + gestor de incidencias
│   ├── suppliers.ts
│   ├── inventory.ts                # única capa de llamadas a /inventory
│   ├── useInventoryData.ts         # carga con estados y stock reactivo
│   └── nexova.ts                   # datos de CONTEXT.md tipados con packages/shared
├── types/inventory.ts              # tipos de services/api/app/schemas.py
└── next.config.ts                  # turbopack.root = raíz del monorepo
```

`AGENTS.md` y `CLAUDE.md` de esta carpeta los genera y mantiene `next dev`, igual que en el tracker. Las instrucciones del monorepo están en el [`AGENTS.md` raíz](../../AGENTS.md).
