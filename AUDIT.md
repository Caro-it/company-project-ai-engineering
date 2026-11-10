# Auditoría de rendimiento frontend — Nexova

Rama `feature/performance-audit`. Línea base tomada el 2026-11-10 sobre `main` (`6adec31`).
Resultados finales y comparación antes/después en [`REPORT.md`](./REPORT.md).

## 1. Metodología

### Entorno (siempre en modo producción)

| Pieza | Comando | Puerto |
|---|---|---|
| API (`services/api`) | `uv run uvicorn app.main:app --port 8000` (sin `--reload`) | 8000 |
| Backoffice (`uis/backoffice`) | `npm run build` + `npm run start` | 3001 (el que fija `npm run start` y el que admite el CORS de la API) |
| Web corporativa (`uis/website`) | `npm run build` + `npm run preview` | 4321 |

Ninguna medición se hizo con `npm run dev`: el modo desarrollo no minifica, no divide el código igual y añade overlays, así que sus cifras no son comparables con producción.

### Herramienta

- **Lighthouse 13.6.0** por su API de Node, con Chrome 156 headless (`chrome-launcher`) y `puppeteer-core`. Runner: [`audit/scripts/run-lighthouse.mjs`](./audit/scripts/run-lighthouse.mjs) (`npm ci` y `node run-lighthouse.mjs before|after` desde `audit/scripts`).
- Categorías: Performance, Accessibility, Best Practices y SEO.
- **Móvil:** configuración por defecto de Lighthouse (Moto G Power emulado, throttling simulado: RTT 150 ms, 1,6 Mbps, CPU ×4).
- **Escritorio:** `desktop-config` de Lighthouse (1350 px, RTT 40 ms, 10 Mbps, sin ralentizar la CPU).
- **3 ejecuciones por página y form factor**, cada una en un Chrome nuevo. Se guarda la ejecución mediana según `computeMedianRun` de Lighthouse (mediana de FCP y LCP). `summary.json` conserva las métricas de las tres ejecuciones para ver la dispersión.

### Páginas

| Id | URL | Sesión |
|---|---|---|
| `web-home` | `http://localhost:4321/` | Pública |
| `bo-login` | `http://localhost:3001/login` | Sin sesión |
| `bo-incidencias` | `http://localhost:3001/incidencias` | Autenticada |
| `bo-proveedores` | `http://localhost:3001/proveedores` | Autenticada |

### Páginas autenticadas

El backoffice guarda el JWT en `localStorage` (`nexova_token`) y lo comprueba en cliente (`AuthGuard`), así que una URL protegida abierta por Lighthouse sin más acabaría en `/login`. El runner:

1. Registra (`POST /users`) o inicia sesión (`POST /auth/login`) con un usuario local de pruebas (`lighthouse.audit@nexova-demo.com`, solo en la TinyDB de desarrollo, ignorada por git).
2. Abre con Puppeteer una URL del mismo origen y guarda el token en `localStorage`.
3. **Vacía la caché HTTP** por CDP (`Network.clearBrowserCache`). Sin este paso, la visita del punto 2 deja los chunks de JS cacheados y las páginas autenticadas parecen más ligeras de lo que son. Se detectó en una primera pasada (0 bytes transferidos de JS) y esa pasada se descartó.
4. Lighthouse audita **la misma pestaña** con `disableStorageReset: true` (sin "clear storage"), así que la sesión se mantiene.
5. Si la URL final no es la pedida (redirección a `/login`), la ejecución se aborta.

### Informes

`audit/before/<página>.<mobile|desktop>.{html,json}` (ejecución mediana) y `audit/before/summary.json`.

### Límites de la medición

- Todo es `localhost`: TTFB casi nulo y sin CDN ni compresión real de red. El throttling simulado (Lantern) estima la red móvil a partir de esa traza, así que las cifras absolutas son orientativas y lo útil es la comparación antes/después con las mismas condiciones.
- La máquina tiene otros procesos abiertos. Por eso se usan 3 ejecuciones y la mediana. Aun así se ve ruido: `bo-proveedores` móvil dio 93 / 97 / 96.

## 2. Puntuaciones iniciales (mediana de 3)

LCP, FCP y TBT en milisegundos.

| Página | Form factor | Performance | Accessibility | Best Practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|---|
| Web · home | Móvil | 100 | 100 | 96 | 100 | 756 | 756 | 0 | 0 |
| Web · home | Escritorio | 100 | 100 | 96 | 100 | 206 | 206 | 0 | 0 |
| Backoffice · /login | Móvil | 97 | 100 | 96 | 60 | 769 | **2162** | 0 | 143 |
| Backoffice · /login | Escritorio | 100 | 100 | 96 | 60 | 212 | 497 | 0 | 0 |
| Backoffice · /incidencias | Móvil | **86** | 100 | 100 | 60 | 766 | 766 | **0.152** | **344** |
| Backoffice · /incidencias | Escritorio | 98 | 100 | 100 | 60 | 216 | 216 | **0.091** | 0 |
| Backoffice · /proveedores | Móvil | 96 | **96** | 100 | 60 | 763 | 763 | 0 | 236 |
| Backoffice · /proveedores | Escritorio | 100 | **96** | 100 | 60 | 215 | 215 | 0.001 | 0 |

Performance de las tres ejecuciones en móvil: web 100/100/100, login 97/97/98, incidencias 86/86/87, proveedores 93/97/96.

## 3. Problemas identificados y causa raíz

Ordenados por impacto. "Se corrige" indica si entra en esta rama.

### P1 · `/incidencias`: desplazamiento de diseño (CLS 0,152 móvil, 0,091 escritorio) — se corrige

- **Auditoría:** `cumulative-layout-shift`, `layout-shifts`. El nodo desplazado es el contenedor del listado (`div.space-y-4`: filtros + tabla).
- **Causa raíz:** `IncidentsStats` pinta una sola línea ("Cargando resumen…") mientras espera a `GET /api/incidents/summary`. Cuando llega la respuesta, la sección crece de golpe con las cuatro tarjetas (`Por estado`, `Por categoría`, `Por origen`, `Por sede`), unos 600 px en móvil, y empuja hacia abajo los filtros y la tabla, que ya estaban pintados.
- **Corrección prevista:** reservar el hueco de las cuatro tarjetas mientras carga (esqueleto con la misma rejilla y número de filas).

### P2 · `/login`: el contenido principal no se pinta hasta hidratar (LCP 2162 ms móvil) — se corrige

- **Auditoría:** `largest-contentful-paint` (LCP ≈ 2,8 veces el FCP). Elemento LCP: el párrafo "Accede al panel interno con tu cuenta.".
- **Causa raíz:** `LoginForm` (`"use client"`) devuelve `null` mientras `useTokenStatus()` vale `null`, y ese es su valor en el servidor y durante la hidratación (el servidor no ve `localStorage`). El HTML que sirve Next solo trae la cabecera; el formulario aparece cuando se descargan (~150 KB) y ejecutan los chunks de React. `RegisterForm` tiene el mismo patrón.
- **Corrección prevista:** pintar el formulario desde el servidor y ocultarlo solo cuando ya se sabe que hay sesión (`hasSession === true`, mientras se redirige a `/`).

### P3 · `/proveedores`: contraste insuficiente (Accessibility 96) — se corrige

- **Auditoría:** `color-contrast`. Nodo: `<p class="text-xs text-slate-400">Fecha pasada</p>` en la columna "Renovación".
- **Causa raíz:** `text-slate-400` (`#90a1b9`) sobre blanco da 2,63:1; WCAG 2.1 AA pide 4,5:1 para texto de 12 px. El guion "—" de las filas sin fecha usa el mismo color.
- **Corrección prevista:** `text-slate-500` / `text-slate-600` (≥ 4,5:1), coherente con el resto de textos secundarios de la tabla.

### P4 · Favicon inexistente en las dos apps (Best Practices 96) — se corrige

- **Auditoría:** `errors-in-console`: `GET /favicon.ico` → 404 en `localhost:4321` y `localhost:3001`.
- **Causa raíz:** ninguna de las dos apps declara icono; el navegador pide `/favicon.ico` por defecto y la respuesta 404 queda como error en consola. En `/incidencias` y `/proveedores` no aparece porque la navegación previa del runner ya había resuelto esa petición.
- **Corrección prevista:** un `icon.svg` con la marca (navy + ámbar). En Next, el archivo `app/icon.svg` genera el `<link rel="icon">`; en Astro, `public/favicon.svg` y su `<link>` en `BaseLayout`.

### P5 · Hoja de estilos que bloquea el render (web: ahorro estimado 150 ms móvil; backoffice: 100–110 ms) — se corrige en la web, se evalúa en el backoffice

- **Auditoría:** `render-blocking-insight`. Web: `/_astro/BaseLayout.*.css` (5 KB). Backoffice: `/_next/static/chunks/*.css` (6 KB).
- **Causa raíz:** la única hoja de Tailwind se enlaza con `<link rel="stylesheet">` en el `<head>`: el navegador no pinta hasta descargarla, y en móvil simulado esa petición cuesta un RTT completo (150 ms + latencia).
- **Corrección prevista:**
  - Web: `build.inlineStylesheets: 'always'` en Astro. Son 5 KB, la web tiene dos páginas y no hay caché que perder entre muchas visitas.
  - Backoffice: Next 16 ofrece `experimental.inlineCss`. Se probará; si no mejora la medición, se documenta y no se deja activado.

### P6 · TBT en móvil en las páginas autenticadas (344 ms en `/incidencias`, 236 ms en `/proveedores`) — parcialmente fuera de alcance

- **Auditorías:** `total-blocking-time`, `max-potential-fid`, `unused-javascript` (27 KB del chunk principal de Next/React) y `legacy-javascript-insight` (14 KB de polyfills: `Array.prototype.at`, `flat`, `Object.hasOwn`…).
- **Causa raíz:**
  - El panel se pinta entero en cliente. `AuthGuard` no muestra nada hasta leer el token, así que toda la página se monta en una sola tarea larga tras la hidratación. Es una decisión de seguridad del ticket AUTH-02 (no enseñar el panel sin sesión) y cambiarla (middleware o cookies) sería reestructurar la autenticación: **fuera de alcance**.
  - `/incidencias` pinta de una vez todas las incidencias (unos 31 KB de JSON; la lista mide ~10 600 px en móvil), sin paginar. Paginar cambia la API y la UX: se deja como recomendación.
  - Los polyfills y el JS "no usado" vienen del runtime de Next 16, no del código de la app; no tienen opción de configuración segura.

### P7 · SEO 60 en el backoffice — no se corrige (intencionado)

- **Auditoría:** `is-crawlable`: `<meta name="robots" content="noindex, nofollow">`.
- **Causa raíz:** `app/layout.tsx` declara `robots: { index: false, follow: false }`. Es correcto: el backoffice es un panel interno con datos de clientes y no debe indexarse. Ya tiene `lang="es"`, `<title>` por página y `meta description`; el resto de auditorías SEO pasan.

### P8 · Otros avisos sin acción

- `bf-cache` en `/login`: la página es dinámica (lee `searchParams`) y Next responde con `Cache-Control: no-store`. Lighthouse lo marca como *Not actionable*.
- `network-dependency-tree-insight`: cadena documento → CSS/JS de un solo nivel; no hay cadenas largas que romper.
- **Imágenes y fuentes:** no hay. Ninguna app usa `<img>`, `next/image`, `next/font` ni Google Fonts (pila de fuentes del sistema), así que no hay nada que optimizar ahí. Se comprobó con `grep` en `app/`, `components/` y `src/`.
- **`"use client"`:** revisados los 19 archivos que lo declaran. Todos usan estado, efectos, `useRouter`/`usePathname` o manejadores de eventos (`error.tsx` y `global-error.tsx` lo exigen por convención de Next). Las páginas (`page.tsx`) y layouts ya son Server Components. No hay ninguno innecesario que quitar sin partir componentes, y partirlos no reduce JS de forma medible (`StatCard`, `AreasTable`, `Sidebar` ya son de servidor).

## 4. Análisis de refactorización

### Lógica duplicada: carga de datos con loading / error / reintento

Tres componentes del backoffice repiten la misma máquina de estados para pedir datos a la API:

| Componente | Petición | Patrón |
|---|---|---|
| `components/incidents/IncidentsStats.tsx` | `getIncidentStats()` | "Clave de petición": `loading = result.key !== requestKey`, `cancelled` en el cleanup, `retries` para reintentar |
| `components/incidents/IncidentsList.tsx` | `listIncidents(filters)` | El mismo, con filtros en la clave |
| `components/SuppliersDirectory.tsx` | `listSuppliers({ country, category })` | Variante con `loading`/`error`/`reloadKey` sueltos y `setLoading(true)` repetido en cuatro manejadores |

Cada uno escribe su `useEffect` con la bandera `cancelled`, su `then`/`catch`, su tipo `Result` y su contador de reintentos (unas 25–30 líneas por componente). Además, los tres pintan el mismo bloque de error con botón "Reintentar" (`role="alert"`, mismas clases rosa).

**Riesgos de la duplicación:** el patrón existe porque `react-hooks/set-state-in-effect` (eslint-config-next 16) rechaza el `setLoading(true)` síncrono dentro del efecto. `SuppliersDirectory` lo esquiva con `setLoading(true)` en cada manejador; si alguien añade un filtro y olvida esa línea, el indicador de carga deja de funcionar. Centralizarlo evita ese tipo de olvidos.

**Propuesta:**

- Hook `useApiResource(requestKey, fetcher, toMessage)` en `lib/useApiResource.ts`: devuelve `{ data, error, loading, retry, setData }`. Mantiene el patrón de clave de petición (sin `setState` síncrono en el efecto), cancela respuestas obsoletas y permite actualizaciones optimistas (`setData`).
- Componente `RetryAlert` en `components/RetryAlert.tsx` para el aviso de error con "Reintentar".
- Se usa en `IncidentsStats`, `IncidentsList` y `SuppliersDirectory` sin cambiar textos, `data-testid` ni comportamiento visible (los e2e de Playwright dependen de ellos).
- Con tests de Jest del hook (carga, éxito, error, reintento y descarte de respuestas obsoletas).

Fuera de alcance: los formularios (`LoginForm`, `RegisterForm`, `ProfileForm`…) también repiten validación y envío, pero cada uno tiene reglas y errores de API distintos; unificarlos sería un rediseño, no una refactorización acotada.
