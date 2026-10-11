# Carpeta `uis`

Esta carpeta contiene **todos los proyectos con interfaz de usuario** para el proyecto transversal de AI Engineering de la compañía — por ejemplo: un sitio web público, un frontend de panel de administración, una interfaz de ecommerce, portales para clientes, aplicaciones Streamlit/Gradio u otras herramientas sólo-frontend.

Los dos proyectos principales que se almacenan aquí son:

- **`website`** — la presencia web pública de la compañía.
- **`backoffice`** — la aplicación interna de administración. Es el lugar ideal para desarrollar múltiples soluciones dentro de un mismo proyecto: autenticación, gestión de personas, gestión de operaciones, comunicación interna y otras capacidades de back-office.

Organiza `uis/` por **distintas áreas de la compañía** — cada subcarpeta agrupa un ámbito diferente (por ejemplo, web pública frente a operaciones internas) e incluye su propia documentación técnica y funcional.

- **Propósito principal**: centralizar en un único lugar todas las aplicaciones frontend que dan soporte a los casos de uso de la compañía.
- **Recomendación**: documenta en este archivo (o en sub-READMEs) las aplicaciones que vayas añadiendo, su objetivo, tecnología usada y cómo ejecutarlas.

## Aplicaciones de este repositorio

| App | Objetivo | Stack | Arranque | Puerto |
|---|---|---|---|---|
| [`website/`](./website/README.md) | Web pública de Nexova y formulario de registro de talento (Hito 1) | Astro 7 + Tailwind 4 | `npm run dev` | 4321 |
| [`backoffice/`](./backoffice/README.md) | App interna: bienvenida y dashboard vacío con datos del briefing | Next.js 16 + TypeScript + Tailwind 4 | `npm run dev` | 3001 |
| [`talent-pipeline-tracker/`](./talent-pipeline-tracker/README.md) | Pipeline de candidaturas de Operaciones de Selección (Hito 3) | Next.js 16 + TypeScript + Tailwind 4 | `npm run dev` | 3000 |

> _These instructions are also available in [English](./README.md)._
