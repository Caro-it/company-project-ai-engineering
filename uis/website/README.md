# Sitio web público de Nexova — Hito 1

Landing page corporativa y formulario de registro de talento para **Nexova**, consultora de recursos humanos y adquisición de talento con sede en Valencia (España) y oficina en Miami (Florida).

El contenido, los campos del formulario y las reglas de validación provienen de [`CONTEXT.md`](../../CONTEXT.md) en la raíz del repositorio.

---

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Landing page: hero, servicios, por qué Nexova, contacto |
| `application.html` | Formulario de registro de talento (11 campos) |
| `validation.js` | Validación en tiempo real del formulario |

---

## Cómo ejecutarlo localmente

Desde esta carpeta (`uis/website/`):

```bash
npx http-server . -p 3000 -a 0.0.0.0
​```

Abrir <http://localhost:3000>

El parámetro `-a 0.0.0.0` es necesario para que el puerto se exponga correctamente en GitHub Codespaces. El puerto 3000 ya está declarado en `.devcontainer/devcontainer.json`, por lo que Codespaces lo reenvía de forma automática.

---

## Sitio publicado

Desplegado con GitHub Pages:

<https://caro-it.github.io/company-project-ai-engineering/uis/website/index.html>

Resultados de PageSpeed Insights (móvil): Rendimiento 94, Accesibilidad 100, Prácticas recomendadas 100, SEO 100.

---

## Stack

- **HTML5 semántico** — `header`, `nav`, `main`, `section`, `article`, `footer`
- **Tailwind CSS** vía CDN, solo clases utilitarias — sin CSS personalizado
- **JavaScript vanilla** para la validación del formulario
- **Schema.org** JSON-LD (tipo `Organization`) en la landing page

## Accesibilidad

Diseño mobile-first con breakpoints `sm:`, `md:` y `lg:`. Skip link al contenido principal, estados de foco visibles en todos los elementos interactivos, `label` asociado a cada input mediante el atributo `for`, y mensajes de error anunciados con `aria-live`, `aria-invalid` y `aria-describedby`.