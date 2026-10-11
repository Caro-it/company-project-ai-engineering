# Sitio web público de Nexova

Landing page corporativa y formulario de registro de talento de **Nexova** (Nexova Solutions), consultora de recursos humanos y adquisición de talento con sede en Valencia (España) y oficina en Miami (Florida). Nació en el Hito 1 como HTML estático y ahora se construye con Astro, con el mismo contenido.

- Negocio: [`CONTEXT.md`](../../CONTEXT.md).
- Textos literales (hero, servicios, errores, éxito, JSON-LD): [`docs/CONTEXT-hito1-website.md`](../../docs/CONTEXT-hito1-website.md).
- Convenciones para agentes: [`.agents/rules/website.md`](../../.agents/rules/website.md).

---

## Stack

- **Astro 7** con salida estática (`build.format: 'file'`, que genera `index.html` y `application.html`).
- **Tailwind CSS 4** con build real (`@tailwindcss/vite`). La única hoja es `src/styles/global.css` y contiene solo `@import "tailwindcss";`.
- **JavaScript vanilla** para la validación: `public/validation.js`, sin cambios respecto al Hito 1.
- **Schema.org** JSON-LD (`Organization`) en el `<head>` de la landing.

## Cómo ejecutarlo

Requisitos: Node ≥ 22.12 y npm.

```bash
cd uis/website
npm install
npm run dev        # http://localhost:4321/
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto **4321**, con la web en la ruta `/` |
| `npm run build` | Genera `dist/` (`index.html`, `application.html`, `validation.js`, `_astro/*.css`) |
| `npm run preview` | Sirve `dist/` en el puerto 4321 |

Verificación de los textos literales (desde la raíz del repo, tras `npm run build`):

```bash
node .agents/skills/verify-website-literals/scripts/check-literals.mjs
```

## Estructura

```text
uis/website/
├── astro.config.mjs          # base = WEBSITE_BASE (solo en el deploy) o "/"
├── public/validation.js      # validación del formulario (Hito 1, intacto)
└── src/
    ├── styles/global.css     # @import "tailwindcss"; (única excepción de CSS)
    ├── lib/paths.ts          # withBase(): enlaces internos válidos con y sin base
    ├── layouts/BaseLayout.astro       # <html lang="es">, meta, skip link, header, footer
    ├── components/
    │   ├── SiteHeader.astro           # "Nexova" + Inicio | Servicios | Talento | Contacto
    │   ├── SiteFooter.astro           # © 2025 + LinkedIn | Instagram
    │   ├── SectionHeading.astro       # h2 de sección
    │   ├── Card.astro                 # tarjeta con borde superior teal
    │   ├── ServiceCard.astro, HighlightCard.astro, ContactCard.astro
    │   └── FormFieldset.astro, TextField.astro, SelectField.astro,
    │       RadioOption.astro, FieldError.astro   # campos con los ids del Hito 1
    └── pages/
        ├── index.astro               # landing → index.html
        └── application.astro         # formulario → application.html
```

## Publicación (GitHub Pages)

El workflow [`.github/workflows/deploy-website.yml`](../../.github/workflows/deploy-website.yml) se ejecuta con cada push a `main`. Hace lo siguiente:

1. Compila la web con `WEBSITE_BASE=/company-project-ai-engineering/uis/website`.
2. Verifica los literales.
3. Publica la web y la página de pruebas de `packages/shared`.

Las URLs no cambian:

- <https://caro-it.github.io/company-project-ai-engineering/uis/website/index.html>
- <https://caro-it.github.io/company-project-ai-engineering/uis/website/application.html>

Antes del primer despliegue, hay que poner **Settings → Pages → Source** en "GitHub Actions" (pasos en [`memory-bank/progress.md`](../../memory-bank/progress.md)).

Resultado de PageSpeed Insights (móvil) de la versión del Hito 1: Rendimiento 94, Accesibilidad 100, Prácticas recomendadas 100, SEO 100.

## Accesibilidad

- Mobile-first, con breakpoints `sm:`, `md:` y `lg:`.
- Skip link al contenido principal y foco visible (`focus:ring-2`) en todos los elementos interactivos.
- Cada input tiene su `label for`.
- Los errores se anuncian con `aria-live`, `aria-invalid` y `aria-describedby`.
