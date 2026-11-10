# Informe final — Auditoría de rendimiento frontend

Rama `feature/performance-audit`. Diagnóstico y línea base en [`AUDIT.md`](./AUDIT.md). Informes de Lighthouse en `audit/before/` y `audit/after/` (HTML + JSON de la ejecución mediana y `summary.json` con las tres ejecuciones).

## 1. Condiciones

Las mismas en las dos fases: API, backoffice y web en modo producción (`uv run uvicorn` sin `--reload`, `next build` + `next start`, `astro build` + `astro preview`), Lighthouse 13.6.0 con Chrome 156 headless, perfiles móvil y escritorio por defecto, 3 ejecuciones por página en un Chrome nuevo cada vez, caché HTTP vacía y sesión en `localStorage` para las páginas autenticadas. El runner es el mismo ([`audit/scripts/run-lighthouse.mjs`](./audit/scripts/run-lighthouse.mjs)); solo se le añadió un filtro `LH_PAGES` para las pruebas A/B del apartado 4.

## 2. Antes / después

### 2.1 Ejecución mediana de Lighthouse (`computeMedianRun`, la de los informes HTML)

FCP, LCP y TBT en ms. `a → b` = antes → después; un solo valor = sin cambios.

| Página | Perf. | A11y | Best Pr. | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Web · home · móvil | 100 | 100 | 96 → **100** | 100 | 756 → 702 | 756 → **702** | 0 | 0 |
| Web · home · escritorio | 100 | 100 | 96 → **100** | 100 | 206 → 197 | 206 → 197 | 0 | 0 |
| BO · /login · móvil | 97 | 100 | 96 → **100** | 60 | 769 → 770 | 2162 → 2173 (ver 2.2) | 0 | 143 → 153 |
| BO · /login · escritorio | 100 | 100 | 96 → **100** | 60 | 212 → 218 | 497 → 527 (ver 2.2) | 0 | 0 → 8 |
| BO · /incidencias · móvil | 86 → **92** | 100 | 100 | 60 | 766 → 769 | 766 → 769 | 0.152 → **0** | 344 → 351 |
| BO · /incidencias · escritorio | 98 → **100** | 100 | 100 | 60 | 216 → 217 | 216 → 217 | 0.091 → **0.004** | 0 → 7 |
| BO · /proveedores · móvil | 96 → 95 | 96 → **100** | 100 | 60 | 763 → 766 | 763 → 766 | 0 | 236 → 257 |
| BO · /proveedores · escritorio | 100 | 96 → **100** | 100 | 60 | 215 → 219 | 215 → 219 | 0.001 | 0 → 1 |

### 2.2 Mediana de cada métrica por separado

`computeMedianRun` elige **una** ejecución completa (la más cercana a la mediana de FCP y LCP a la vez). Cuando una de las tres ejecuciones es atípica, puede elegir justo esa: en `/login` móvil el LCP de las tres ejecuciones fue 787 / **2173** / 767 ms y el informe mediano es el de 2173. Por eso esta tabla toma la mediana de cada métrica por separado, que describe mejor el efecto de los cambios:

| Página | Perf. | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|
| Web · home · móvil | 100 | 756 → 702 | 756 → **706** | 0 | 0 |
| Web · home · escritorio | 100 | 206 → 197 | 206 → 197 | 0 | 0 |
| BO · /login · móvil | 97 → 98 | 765 → 770 | 2162 → **787** | 0 | 143 → 153 |
| BO · /login · escritorio | 100 | 212 → 218 | 497 → **225** | 0 | 0 → 8 |
| BO · /incidencias · móvil | 86 → **89** | 766 → 769 | 766 → 769 | 0.152 → **0** | 342 → 413 |
| BO · /incidencias · escritorio | 98 → **100** | 216 → 219 | 216 → 219 | 0.091 → **0.004** | 0 → 4 |
| BO · /proveedores · móvil | 96 → 95 | 765 → 766 | 765 → 766 | 0 | 208 → 257 |
| BO · /proveedores · escritorio | 100 | 215 → 216 | 215 → 219 | 0.001 | 0 |

### 2.3 Las tres ejecuciones

| Página (móvil) | Antes: Perf. / LCP / TBT | Después: Perf. / LCP / TBT |
|---|---|---|
| /login | 97 · 97 · 98 / 2162 · 2210 · 2133 / 143 · 148 · 122 | 98 · 97 · 98 / 787 · 2173 · 767 / 154 · 153 · 152 |
| /incidencias | 86 · 86 · 87 / 766 · 766 · 768 / 342 · 344 · 326 | 85 · 89 · 92 / 2897 · 768 · 769 / 413 · 458 · 351 |
| /proveedores | 93 · 97 · 96 / 2712 · 765 · 763 / 208 · 193 · 236 | 95 · 94 · 96 / 766 · 770 · 765 / 257 · 282 · 232 |

**Resumen:**

- **Best Practices 100** en las cuatro páginas (antes 96 en la web y en `/login`).
- **Accessibility 100** en las cuatro (antes 96 en `/proveedores`).
- **CLS de `/incidencias` eliminado** (0,152 → 0 en móvil; 0,091 → 0,004 en escritorio). Es la principal causa de la subida de Performance de 86 a 89–92.
- **LCP de `/login` dividido por 2,7 en móvil** (mediana 2162 → 787 ms) **y por 2,2 en escritorio** (497 → 225 ms).
- **Web:** −7 % de LCP en móvil (756 → 702 ms): ya solo hace una petición antes de pintar.

## 3. Qué cambió en cada commit y por qué mejora

| Commit | Problema de AUDIT.md | Cambio | Por qué mejora |
|---|---|---|---|
| `8525d69` docs(audit): baseline Lighthouse scores | — | `AUDIT.md`, runner y `audit/before/` | Línea base reproducible |
| `c39ad78` perf(backoffice): server-render login and register forms to cut LCP | P2 | `LoginForm` y `RegisterForm` devolvían `null` mientras `useTokenStatus()` era `null` (en el servidor y durante la hidratación). Ahora solo se ocultan con `hasSession === true` (mientras redirigen a `/`) | El formulario viaja en el HTML del servidor y se pinta con el primer frame, sin esperar a descargar y ejecutar ~150 KB de JS. En la traza real, FCP y LCP observados pasan a coincidir |
| `fa173e3` fix(backoffice): reserve incidents summary space while loading to prevent layout shift | P1 | `IncidentsStats` pinta las cuatro tarjetas (con sus etiquetas, que son fijas) y un hueco gris en cada número mientras carga, en vez de una sola línea | La sección ya ocupa su alto final antes de que llegue `/api/incidents/summary`, así que filtros y tabla no se desplazan: CLS 0,152 → 0 |
| `91501fd` fix(backoffice): raise contrast of supplier renewal hints to meet WCAG AA | P3 | "Fecha pasada" y el "—" sin fecha pasan de `text-slate-400` (2,63:1) a `text-slate-600` (> 7:1) | Cumple el 4,5:1 de WCAG 2.1 AA para texto de 12 px: Accessibility 96 → 100 |
| `4b3e099` fix(backoffice): add app icon to stop favicon 404 console error | P4 | `app/icon.svg` (convención de Next 16: genera el `<link rel="icon">`) | El navegador deja de pedir `/favicon.ico` y no hay 404 en consola: Best Practices 96 → 100 |
| `9bbce3f` fix(website): add favicon to stop favicon 404 console error | P4 | `public/favicon.svg` y `<link rel="icon">` en `BaseLayout` con `withBase()` (funciona con el base de GitHub Pages) | Igual que el anterior, en la web |
| `03f5d7c` perf(website): inline Tailwind stylesheet to remove render-blocking CSS | P5 | `build.inlineStylesheets: 'always'` en `astro.config.mjs` | Los 5 KB de CSS viajan en el HTML: la home pasa a una sola petición antes del primer pintado (desaparece `render-blocking-insight`). El código fuente sigue sin estilos escritos a mano (`git grep '<style\|style='` vacío) y los 58 literales pasan |
| `d2a3209` perf(backoffice): inline CSS to remove render-blocking stylesheet | P5 | `experimental.inlineCss` en `next.config.ts` | Probado con 1 sola ejecución por página: parecía bajar el LCP de `/login` móvil de 2223 a 866 ms |
| `829a058` refactor(backoffice): extract useApiResource hook and RetryAlert for data loading states | Análisis de refactorización | Ver apartado 5 | Sin efecto de rendimiento buscado: elimina duplicación |
| `0f3cd86` revert(backoffice): drop experimental inlineCss after A/B showed no gain | P5 | Revierte `d2a3209` | Ver apartado 4 |

Después de cada commit de código: `npm run lint`, `npx jest` y `npm run build` del backoffice (o `npm run build` + `check-literals.mjs` en la web), y el flujo pre-commit de `AGENTS.md`. Tras la refactorización también los e2e de Playwright: 16/16.

## 4. Qué no mejoró y por qué

### `inlineCss` en el backoffice: probado y revertido

La primera prueba se hizo con **una sola ejecución** y comparaba una ejecución lenta sin la opción contra una rápida con ella. Con la pasada completa de 3 ejecuciones vi que `/login` móvil seguía teniendo una ejecución de ~2,2 s, así que repetí la prueba A/B con 3 ejecuciones y la opción desactivada:

| `/login` móvil, LCP de las 3 ejecuciones | Con `inlineCss` | Sin `inlineCss` |
|---|---|---|
| | 2409 · 849 · 884 | 2188 · 772 · 770 |

Mismo comportamiento (una ejecución lenta de cada tres) y algo peor con la opción, mientras que el HTML de `/incidencias` crecía de 13 KB a 88 KB sin comprimir: la hoja se incrusta en el `<style>` **y** en el payload RSC de cada respuesta y de cada prefetch. Como AUDIT.md decía que solo se mantendría si mejoraba la medición, se revirtió. La mejora real de `/login` venía del commit `c39ad78`.

**Lección:** la primera conclusión salió de una sola ejecución y fue errónea. Por eso el método exige 3 ejecuciones y mediana.

### LCP bimodal en móvil (una de cada tres ejecuciones sale en 2,2–2,9 s)

En `/login` y en `/incidencias` móvil, una ejecución de cada tres da un LCP simulado de 2–3 s aunque el LCP **observado** en la traza es de ~200 ms. Es un efecto de medir en `localhost` con throttling simulado (Lantern): en `localhost` los chunks de JS llegan en pocos milisegundos y, según cómo se ordenen respecto al primer pintado, Lantern decide que el LCP depende de todo ese JS y lo ralentiza ×4 como CPU móvil. Ya pasaba antes (`/proveedores` móvil: 2712 · 765 · 763) y no responde a un cambio de código. En un servidor real, con latencia de red, el HTML pintaría mucho antes de que llegue el JS.

### TBT en móvil de `/incidencias` y `/proveedores` (~250–450 ms)

La mediana de TBT de `/incidencias` sube de 342 a 413 ms y la de `/proveedores` de 208 a 257 ms. Para saber si era una regresión, medí **el código de la línea base en la misma sesión** que el código final (A/B con `git checkout 8525d69 -- uis/backoffice`, mismas condiciones):

| Móvil, TBT de las 3 ejecuciones | Código base, misma sesión | Código final |
|---|---|---|
| `/incidencias` | 482 · 344 · 363 | 413 · 458 · 351 |
| `/proveedores` | 237 · 255 · 196 | 257 · 282 · 232 |

Los rangos se solapan: la diferencia con la tabla de antes es carga de la máquina entre una sesión y otra, no un efecto de los cambios. La causa de fondo sigue ahí y no se corrige en esta rama:

- `AuthGuard` no deja pintar el panel hasta leer el token en cliente, así que toda la página se monta en una tarea larga tras la hidratación. Cambiarlo (middleware con cookies) es rediseñar la autenticación de AUTH-02.
- `/incidencias` pinta las 96 incidencias de golpe (layout ~380 ms y render de React ~250 ms con CPU ×4). La solución natural es paginar, pero cambia la UX y la API, y los e2e esperan las 96 filas: queda como recomendación.
- `legacy-javascript` (14 KB de polyfills) y `unused-javascript` (~27 KB) vienen del runtime de Next 16/React, no del código de la app.

### SEO 60 en el backoffice: intencionado

`<meta name="robots" content="noindex, nofollow">` es correcto en un panel interno con datos de clientes. El resto de auditorías SEO pasan (`lang="es"`, `<title>` por página y `meta description`).

### Imágenes, fuentes y `"use client"`

No había nada que corregir: ninguna app usa imágenes ni fuentes web, y los 19 `"use client"` son necesarios (detalle en AUDIT.md, P8).

## 5. Refactorización

**Hook `useApiResource`** ([`uis/backoffice/lib/useApiResource.ts`](./uis/backoffice/lib/useApiResource.ts)) y **componente `RetryAlert`** ([`uis/backoffice/components/RetryAlert.tsx`](./uis/backoffice/components/RetryAlert.tsx)), commit `829a058`.

```ts
const { data, error, loading, retry, setData } = useApiResource(
  requestKey,                 // cambia → nueva petición (p. ej. JSON de los filtros)
  () => listSuppliers(filtros),
  { initialData: [], toMessage: errorMessage, keepDataOnError?: boolean },
);
```

- Encapsula el patrón "clave de petición" que ya usaba el backoffice: `loading` se deriva de la clave de la última respuesta, sin `setState` síncrono en el efecto (`react-hooks/set-state-in-effect`), las respuestas obsoletas se descartan y `retry()` repite la petición. `fetcher` y las opciones se leen con `useEffectEvent` (React 19.2), así que no son dependencias del efecto.
- `setData` permite las actualizaciones optimistas de fila que ya hacían los listados.
- `RetryAlert` sustituye los tres bloques de error con "Reintentar" que estaban copiados.

**Dónde se usa:** `IncidentsStats` (con `keepDataOnError: true`, como antes), `IncidentsList` y `SuppliersDirectory`.

**Resultado:**

- 164 líneas eliminadas de los tres componentes (+113 entre hook y componente, más 131 de tests).
- `SuppliersDirectory` ya no necesita el `setLoading(true)` repetido en cuatro manejadores: el olvido que podía dejar el indicador de carga roto ya no es posible.
- Los textos, roles ARIA y `data-testid` no cambian.

**Verificación:**

- `__tests__/useApiResource.test.ts`: 6 tests de Jest (carga inicial, éxito, error con `toMessage`, `keepDataOnError`, `retry`, respuesta obsoleta descartada y `setData`). Total del backoffice: 57/57.
- e2e de Playwright 16/16 (resumen, listado, filtros, error + reintento, cambio de estado optimista, formulario y analizador).
