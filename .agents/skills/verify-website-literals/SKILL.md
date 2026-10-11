---
name: verify-website-literals
description: Comprueba que la web pública de Nexova contiene, carácter por carácter, los textos literales y el JSON-LD de docs/CONTEXT-hito1-website.md. Úsala después de cualquier cambio en uis/website y antes de cada commit que la toque.
---

# Skill: verificar los literales de la web pública

## Objetivo (único)

Demostrar con un comando que las páginas de `uis/website` reproducen **sin parafrasear** todos los textos literales del briefing del Hito 1 y su JSON-LD. El evaluador del bootcamp compara esos textos contra el briefing, y cualquier reescritura cuenta como fallo.

## Cuándo usarla

- Después de editar cualquier archivo de `uis/website/` (contenido, componentes, migración a Astro).
- En el paso 6 del flujo pre-commit de [`AGENTS.md`](../../../AGENTS.md).
- **No** sirve para revisar el diseño, la accesibilidad ni la lógica de validación: solo comprueba la presencia literal de textos.

## Inputs

| Input | Obligatorio | Valor por defecto | Descripción |
|---|---|---|---|
| Fuente de literales | — (fijo) | `docs/CONTEXT-hito1-website.md` | Se lee y se parsea en cada ejecución; no hay listas copiadas a mano |
| `dirWeb` (1.er argumento) | No | `uis/website/dist` si existe; si no, `uis/website` | Carpeta con `index.html`, `application.html` y los `.js` de la web. Tras migrar a Astro hay que ejecutar antes `npm --prefix uis/website run build` |

## Qué comprueba

1. **Landing** (`index.html`, con las etiquetas eliminadas y los espacios normalizados): los 4 enlaces de navegación, el titular, el subtítulo, el CTA, los 3 servicios con sus 2 puntos cada uno, los 4 puntos de "Por qué Nexova", el email y los dos teléfonos, el copyright, y LinkedIn e Instagram.
2. **Formulario** (`application.html` y todos los `*.js`): las opciones de los selects y radios, los 11 mensajes de error (en el de comentarios, el prefijo antes de `X`), las 3 líneas del mensaje de éxito y el aviso para empresas.
3. **JSON-LD:** el `<script type="application/ld+json">` de la landing, parseado, es idéntico al bloque `json` de la fuente.

## Procedimiento

1. Si la web tiene build (Astro): `npm --prefix uis/website run build`.
2. Desde la raíz del repo: `node .agents/skills/verify-website-literals/scripts/check-literals.mjs [dirWeb]`.
3. Si hay líneas `✗`, se corrige **el código de la web** para que coincida con la fuente. Nunca se edita `docs/CONTEXT-hito1-website.md`, que está protegido.
4. Se repite hasta que salga `OK`.

## Criterios de aceptación (verificables)

- [ ] El script termina con **código de salida 0**.
- [ ] La última línea es `OK: N/N comprobaciones`, con el mismo N a ambos lados. Hoy N = 58.
- [ ] Ninguna línea empieza por `✗`.
- [ ] La línea del JSON-LD dice `✓ idéntico a la fuente`.
- [ ] `git status` no muestra cambios en `docs/CONTEXT-hito1-website.md`.

## Ejemplo de fallo

Si se cambia "Selecciona tu disponibilidad" por "Campo inválido", la salida muestra `✗ Selecciona tu disponibilidad` y `FALLO: 57/58 comprobaciones`, con código de salida 1.
