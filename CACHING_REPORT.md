# Informe de Caching — Nexova Solutions

Proyecto «Optimización de rendimiento: Caching». Rama `feature/caching-optimisation`,
creada desde `feature/serialization-audit` (PR #18), porque los endpoints que se cachean
ya devuelven los schemas de esa auditoría y `main` todavía no la tiene.

Principio seguido: **primero medir, luego cachear solo donde coste × frecuencia ×
estabilidad lo justifican.** Pocas decisiones, cada una con su TTL y su invalidación.

---

## 1. Cómo se midió

### Backend

- **Middleware de timing** en `services/api/app/main.py`: una línea de log por petición
  (`GET /api/incidents/summary → 200 | 21.8ms`) y la cabecera `X-Response-Time-ms`.
  Solo registra método, ruta, status y ms: nunca query params ni cuerpos.
- **Volumen realista** con `uv run seed-load` (`services/api/app/seed_load.py`): 5000
  incidencias con categorías, sedes, orígenes, fechas y estados variados (los estados
  siguen las transiciones válidas) y 300 activos con ~7400 órdenes de entrada/salida que
  nunca dejan el stock en negativo. Todo lleva marca (`[LOAD] ` en el título, SKU
  `LOAD-…`) y `uv run seed-load --purge` lo borra sin tocar los datos reales.
- **Medición repetible** con `uv run bench-cache` (`services/api/app/bench_cache.py`):
  para cada endpoint vacía el caché, hace una petición (miss) y otra igual (hit); mediana
  de 15 repeticiones.

| Volumen | Filas |
| --- | --- |
| Antes del seed de carga | 15 proveedores · 6 activos · 8 órdenes · 0 incidencias |
| Después (`seed-load`) | 5000 incidencias · 15 proveedores · 306 activos · 7369 órdenes |

> ⚠️ **Entorno de la medición:** TinyDB en disco y el inventario en **SQLite local**, no
> en Supabase. Con Supabase cada miss de `/inventory/products` suma además la ida y
> vuelta de red al pooler, así que el ahorro real del caché en ese endpoint será mayor
> que el de esta tabla. Para tener la cifra con Supabase: `uv run seed-load` +
> `uv run bench-cache` con el `.env` real (y `uv run seed-load --purge` al terminar).

**Tiempo dentro de la API (mediana, ms):**

| Endpoint | Con seed normal | Con seed de carga · miss | Con seed de carga · hit |
| --- | ---: | ---: | ---: |
| `GET /api/incidents/summary` | 1.3 | 21.8 | **1.2** |
| `GET /inventory/products` | 3.2 | 11.6 | **1.8** |
| `GET /inventory/products?office=Valencia` | 2.7 | 8.3 | **1.5** |
| `GET /api/incidents` (no cacheado) | 1.3 | 54.1 | 53.2 |
| `GET /inventory/orders` (no cacheado) | 2.3 | 227.3 | 212.8 |
| `GET /suppliers` (no cacheado) | 1.3 | 1.3 | 1.2 |

Con el seed normal ningún endpoint pasa de 4 ms: sin el seed de carga no habría habido
nada que justificar.

### Frontend

Build de producción (`next build`) antes y después, revisando qué chunks de JS carga el
HTML inicial de cada ruta y en qué chunk acaba cada componente.

---

## 2. Decisiones en el backend

Caché en proceso: `services/api/app/cache.py` (`TTLCache`, un diccionario con caducidad,
seguro entre hilos). No se usa Redis: la API corre como un único proceso uvicorn (también
en Docker) y un servicio más en el `docker-compose` no compensa para dos endpoints. Ver
«Riesgos» para cuándo habría que cambiarlo.

Las dos claves de caché son **globales a propósito**: los dos endpoints devuelven lo
mismo a cualquier usuario autenticado (no dependen de quién pide) y no contienen datos
personales. El caché está *detrás* de `get_current_user`: sin token se responde 401 antes
de mirar el caché (`test_cache_requires_token_before_serving`).

### 2.1 `GET /api/incidents/summary` — TTL 30 s

| | |
| --- | --- |
| **Coste** | Lee y recorre **todas** las incidencias para contar por estado, categoría, origen y sede. Crece lineal con la tabla: 1.3 ms → 21.8 ms al pasar de 0 a 5000 incidencias. TinyDB vuelve a leer y parsear el JSON entero en cada consulta. |
| **Frecuencia** | Cada carga de `/incidencias` lo pide, y el backoffice lo vuelve a pedir **tras cada cambio de estado** en el listado (`IncidentsDashboard` → `refreshKey`). En un día de triaje es la lectura más repetida de la sección. |
| **Estabilidad** | Los totales solo cambian con un alta o un cambio de estado. |
| **Clave** | Una sola (`"all"`): el endpoint no tiene parámetros. |
| **Invalidación** | `POST /api/incidents` y `PATCH /api/incidents/{id}/status` (solo si la transición se aplica; una transición rechazada con 400 no toca el caché). |
| **Resultado** | Miss 21.8 ms → hit 1.2 ms. |

### 2.2 `GET /inventory/products` — TTL 60 s, clave por filtros

| | |
| --- | --- |
| **Coste** | El stock no está en una columna: se calcula con `SUM(entradas) − SUM(salidas)` en dos subconsultas agregadas sobre todas las órdenes, más el JOIN con los activos. Es el único de los dos que va por red (Supabase). Local: 3.2 ms → 11.6 ms con 7369 órdenes. |
| **Frecuencia** | Es el listado principal del inventario: la pantalla de inventario del backoffice (PR #14) lo pide al entrar y al cambiar de filtro. |
| **Estabilidad** | Solo cambia con un activo nuevo o una orden. Las lecturas superan con mucho a las escrituras. |
| **Clave** | `(office, category)`: cada combinación de filtros es una entrada distinta. Son como mucho 3 × 5 = 15 entradas, así que no hace falta límite de tamaño. |
| **Invalidación** | `POST /inventory/products`, `POST /inventory/orders/inbound` y `POST /inventory/orders/outbound` vacían **todas** las combinaciones (una orden cambia el stock de un activo, que aparece en varias claves; vaciar todo es más simple y seguro que calcular cuáles). Solo tras una escritura correcta: un 400 por falta de stock no invalida. |
| **Resultado** | Miss 11.6 ms → hit 1.8 ms (en local; con Supabase el miss incluye además la latencia de red). |

### 2.3 Detalles de la implementación

- **TTL obligatorio** en cada caché, también con invalidación: cubre las escrituras que
  no pasan por la API (scripts de seed, cambios a mano en Supabase).
- **Carrera cálculo/invalidación:** si una escritura invalida mientras otra petición está
  calculando el valor, ese valor puede salir ya viejo, así que no se guarda (contador de
  generación en `TTLCache`; test `test_value_computed_during_an_invalidation_is_not_stored`).
- **Evidencia:** `GET /api/cache/stats` (con token) devuelve aciertos, fallos, entradas y
  TTL de cada caché.
- **Tests:** `services/api/tests/test_caching.py` (13 tests): TTL con reloj falso, claves
  independientes, servir desde caché, invalidación en cada escritura, que una escritura
  fallida no invalida, 401 antes del caché y la cabecera de timing. El `conftest.py` vacía
  los cachés entre tests. Suite completa: **180 passed**.

---

## 3. Decisiones en el frontend (`uis/backoffice`)

### 3.1 Lazy Loading — formulario de alta de proveedores

`SupplierForm` se ha partido en dos:

- `SupplierForm.tsx`: la cabecera con el botón «+ Nuevo proveedor» y el mensaje de éxito.
- `SupplierCreateForm.tsx`: el formulario completo (9 campos, validación en cliente,
  traducción de los 422 de la API). Se importa con `next/dynamic` y **solo se descarga
  la primera vez que se abre el formulario**.

**Por qué:** antes el formulario venía siempre con `/proveedores` aunque empiece cerrado
y la mayoría de visitas solo consulten o filtren el directorio. Es el componente más
grande de la página.

**Medido:** el código del formulario ahora va en un chunk aparte de **6.5 KB (2.1 KB
gzip)** que no aparece en el HTML inicial de `/proveedores`; antes estaba dentro del
chunk de la página (20.0 KB).

### 3.2 Lazy Loading — resultados del analizador de incidencias

Las tarjetas y tablas de resultados de `IncidentsAnalyzer` pasan a
`components/incidents/AnalysisResults.tsx`, cargado con `next/dynamic`.

**Por qué:** en `/incidencias/analizador` los resultados no existen hasta que se sube un
CSV y la API responde. Mientras se analiza el fichero (la parte lenta) el navegador ya
puede ir descargando el chunk, así que el usuario no nota la espera extra.

**Medido:** chunk aparte de **3.6 KB (1.3 KB gzip)**, fuera del HTML inicial.

> Siendo honestos con las cifras: el backoffice es pequeño y el ahorro en bytes es
> modesto (unos 3–6 KB por ruta). La decisión se justifica más por el patrón (código que
> la mayoría de visitas no usa no debe ir en la carga inicial) que por el tamaño de hoy;
> el ahorro crece a medida que esos componentes crezcan.

### 3.3 `useMemo` — resumen del directorio de proveedores

`SuppliersDirectory` muestra ahora un resumen: proveedores activos, gasto mensual por
moneda (EUR y USD por separado, nunca sumados) y cuántos renuevan en los próximos 60 días.
Calcularlo recorre todo el listado, parsea la fecha de renovación de cada proveedor y
acumula tarifas por moneda.

```tsx
const summary = useMemo(() => summarize(suppliers), [suppliers]);
```

- **Dependencias:** solo `suppliers`, que es la única entrada de `summarize`. Cambia
  cuando llega una respuesta nueva de la API o tras un PATCH de tarifa/estado (que crea
  un array nuevo con `map`).
- **Qué se evita:** recalcular en los renders que no cambian el listado (cambio de
  `loading` al filtrar, errores, el contador `reloadKey`).

Además, `formatMoney` reutiliza un `Intl.NumberFormat` por moneda en vez de crear uno
nuevo por fila y por render (crear el formateador cuesta mucho más que usarlo).

---

## 4. Intercambios reconocidos (frescura vs. rendimiento)

- **Resumen de incidencias, 30 s.** Lo que se puede quedar viejo es un contador de un
  panel, no una decisión: quien gestiona una incidencia la ve en el listado, que **no**
  está cacheado. Y las escrituras hechas desde el backoffice invalidan al momento, así que
  el usuario que cambia un estado ve el resumen correcto en la recarga siguiente. Los 30 s
  solo aplican a cambios que llegan por otra vía (el seed, otro proceso). Se eligió más
  corto que el del inventario porque el triaje de incidencias cambia más a menudo.
- **Stock del inventario, 60 s.** El riesgo serio sería vender/asignar stock que no hay,
  y eso **no depende del caché**: `POST /inventory/orders/outbound` comprueba el stock
  contra la base de datos con `SELECT … FOR UPDATE`, nunca contra el valor cacheado. En el
  peor caso alguien ve durante un minuto un stock que ya no es real y la salida se rechaza
  con el mensaje de stock insuficiente. Aceptable para un listado de consulta.

---

## 5. Qué no se cacheó y por qué

| Candidato | Medido (5000 / 7369 filas) | Por qué no |
| --- | ---: | --- |
| `GET /inventory/orders` | 227 ms | **El más lento**, pero es el historial de auditoría: tras registrar una orden hay que verla al momento, y como toda orden lo invalidaría, el porcentaje de aciertos sería bajo justo cuando más se usa. Además el coste está en construir y serializar 7369 filas en cada respuesta: la solución correcta es **paginar**, no guardar una respuesta enorme en memoria. |
| `GET /api/incidents` | 54 ms | Tiene 4 filtros combinables (cientos de claves posibles) y cada cambio de estado lo invalidaría. Es la pantalla de trabajo: tiene que estar al día. Igual que el anterior, el arreglo es paginar. |
| `GET /suppliers` | 1.3 ms | No cuesta nada (15 proveedores). Cachear añadiría complejidad sin beneficio medible. |
| `GET /users/me`, `/profiles/…` | — | Datos personales: con una clave compartida serían una fuga de datos. Además son lecturas baratas por id. |
| `GET /inventory/products/{id}` | — | Lectura por clave primaria, barata; y cuando se mira un activo concreto se quiere su stock exacto. |
| Frontend: `useMemo` en `IncidentsList` | — | Se miró: el listado no filtra ni ordena en cliente (lo hace la API), así que no hay cálculo caro que memoizar. |

---

## 6. Riesgos y siguiente paso

- **Un solo proceso.** Si la API se arranca con varios workers (`uvicorn --workers N`) o
  varias réplicas, cada uno tendría su caché y la invalidación solo llegaría al que
  atendió la escritura (los demás servirían datos viejos hasta 30–60 s). En ese momento
  hay que pasar a Redis manteniendo la misma interfaz (`get_or_set` / `invalidate`).
- **Memoria:** acotada (1 entrada para el resumen, como mucho 15 para productos).
- **Siguiente optimización con más impacto:** paginar `/inventory/orders` y
  `/api/incidents` (sección 5).

## 7. Cómo reproducirlo

```bash
cd services/api
uv run pytest tests/test_caching.py   # tests del caché
uv run seed-load                      # volumen de prueba (escribe en la BD del .env)
uv run bench-cache                    # tabla miss/hit
uv run seed-load --purge              # borrar el volumen de prueba
```

Con la API arrancada, el log `api.timing` muestra la duración de cada petición y
`GET /api/cache/stats` los aciertos y fallos de cada caché.
