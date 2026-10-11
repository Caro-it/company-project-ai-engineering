---
name: website
description: Convenciones de la web pública de Nexova (Hito 1) — literales, archivos, formulario, Tailwind, accesibilidad y SEO
scope: glob
globs:
  - "uis/website/**"
---

# Regla: web pública de Nexova (`uis/website`)

**Alcance:** por patrón de archivo. Se aplica siempre que se cree, edite o revise algo bajo `uis/website/**`.

## Textos literales

- La fuente es [`docs/CONTEXT-hito1-website.md`](../../docs/CONTEXT-hito1-website.md): hero, servicios, "Por qué Nexova", contacto, footer, opciones del formulario, los 11 mensajes de error, el mensaje de éxito, el aviso para empresas y el JSON-LD. Se copian **carácter por carácter**.
  - No se parafrasean, no se traducen y no se inventa copy de marketing.
  - Se rechaza cualquier mensaje genérico del tipo "Campo inválido".
- "12 años de experiencia en el mercado latinoamericano" se copia tal cual, aunque choque con 2011 y con España/EE. UU. **No se corrige.**
- En `Los comentarios no pueden exceder 500 caracteres (quedan X)`, `X` es el número real de caracteres restantes.
- El aviso `¿Eres una empresa buscando talento? Escríbenos a contacto@nexova.com` es obligatorio y visible en el formulario.
- El JSON-LD `Organization` va sin modificar en un `<script type="application/ld+json">` dentro del `<head>` de la landing.
- Se verifica con la skill [`verify-website-literals`](../skills/verify-website-literals/SKILL.md).

## Archivos y URLs

- Los nombres van en inglés: `index.html`, `application.html`, `validation.js`. Nunca `aplicacion.html` ni `validacion.js`.
- La web es Astro 7:
  - `src/pages/index.astro` genera `index.html` y `src/pages/application.astro` genera `application.html` (`build.format: 'file'`).
  - `validation.js` vive en `public/` y no se reescribe.
- Los componentes reutilizables están en `src/components/` y el layout común en `src/layouts/BaseLayout.astro`. Una sección o campo nuevo reutiliza un componente existente antes de crear otro.
- Los enlaces internos y los assets usan `withBase()` (`src/lib/paths.ts`), nunca rutas absolutas escritas a mano:
  - En local, la web vive en `http://localhost:4321/`.
  - En GitHub Pages, el workflow define `WEBSITE_BASE=/company-project-ai-engineering/uis/website`.
- El CTA del hero y el enlace "Talento" del menú apuntan a `application.html`.
- Las URLs publicadas `…/uis/website/index.html` y `…/uis/website/application.html` no deben romperse.

## Estructura de la landing (orden fijo)

1. Header: "Nexova" y un `<nav>` con exactamente 4 enlaces: `Inicio | Servicios | Talento | Contacto`.
2. Hero.
3. Servicios, en 3 columnas, con un `<article>` por servicio.
4. Por qué Nexova, en 2 columnas.
5. Contacto.
6. Footer, con enlaces a LinkedIn e Instagram.

## Formulario (`application.html`)

| Campo | `id` / `name` | Elemento | Obligatorio |
|---|---|---|---|
| Nombre completo | `nombre-completo` | `input type="text"` | Sí |
| Email | `email` | `input type="email"` | Sí |
| Teléfono | `telefono` | `input type="tel"` | Sí |
| País de residencia | `pais` | `select` | Sí |
| Años de experiencia | `anios-experiencia` | `input type="number"` min=0 max=50 | Sí |
| Sector de interés | `sector` | `select` | Sí |
| Nivel de inglés | `nivel-ingles` | `select` | Sí |
| Disponibilidad | `disponibilidad` | 4 × `input type="radio"` | Sí |
| LinkedIn | `linkedin` | `input type="url"` | No |
| Comentarios adicionales | `comentarios` | `textarea` maxlength=500 | No |
| Acepto política de datos | `politica-datos` | `input type="checkbox"` | Sí |

- Los IDs van en minúsculas, separados por guion y sin tildes ni ñ.
- Fieldsets, cada uno con su `<legend>`:
  1. **Datos personales**: nombre, email, teléfono, país.
  2. **Perfil profesional**: años, sector, nivel de inglés, LinkedIn.
  3. **Disponibilidad**: los 4 radios.
  4. **Información adicional**: comentarios y política de datos.
- Botón principal "enviar" y botón secundario "limpiar".

## Validación (`validation.js`)

- Reglas por campo:
  - Nombre: al menos 2 palabras.
  - Email: `@` y dominio válido.
  - Teléfono: empieza por `+` y código de país.
  - Años: entero entre 0 y 50.
  - Selects: con opción elegida. Radios: uno marcado.
  - LinkedIn: opcional, pero si se rellena empieza por `http://` o `https://`.
  - Comentarios: como máximo 500 caracteres, con **contador visible**.
  - Política de datos: checkbox marcado.
- Se valida en tiempo real con `input` y `blur`. Si hay errores se bloquea el envío con `e.preventDefault()` y se muestra un resumen de errores.
- Accesibilidad de los errores: `aria-live="polite"`, `aria-invalid` en el campo y `aria-describedby` apuntando al mensaje.
- Si todo es correcto, se **simula** el envío (no hay backend) y se muestra el mensaje de éxito literal.

## HTML, Tailwind, accesibilidad y SEO

- HTML5 semántico (`header`, `nav`, `main`, `section`, `article`, `footer`); nunca un `<div>` donde haya una etiqueta semántica adecuada.
- Un solo `<h1>` por página y jerarquía h1 → h2 → h3 sin saltos. `<html lang="es">`.
- Solo clases utilitarias de Tailwind: ni `<style>`, ni `styles.css`, ni `style=`, ni `@media` escrito a mano.
  - **Única excepción (aprobada):** `uis/website/src/styles/global.css` con una sola línea, `@import "tailwindcss";`. Es el punto de entrada que necesita Tailwind 4 en Astro. No admite reglas, `@theme` ni `@apply`.
- Mobile-first, con `sm:`, `md:` y `lg:` presentes en el proyecto.
- Colores de la identidad: navy `#001D4A`, slate-blue `#27476E`, teal `#006992`, amber `#ECA400`. Contraste mínimo de 4.5:1.
- WCAG 2.1 AA:
  - Todo se puede usar con teclado, con foco visible (`focus:ring-2`).
  - Cada input tiene su `<label for>`.
  - Skip link al `<main>` al inicio del `<body>`.
  - Las imágenes llevan `alt` descriptivo (`alt=""` solo si son decorativas).
  - `aria-*` solo donde aporte.
- SEO: `<title>` y `<meta name="description">` en ambas páginas.

## Comprobación rápida

```bash
git grep -nE '<style|style=' -- uis/website   # vacío
git grep -nE 'Chile|Argentina|aplicacion\.html|validacion\.js' -- uis/website  # vacío
node .agents/skills/verify-website-literals/scripts/check-literals.mjs      # OK: N/N
```
