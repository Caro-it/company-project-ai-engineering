# `uis` folder

This folder contains **all projects with a user interface** for the cross-functional AI Engineering company project — for example: a public website, admin dashboard frontend, ecommerce UI, customer portals, Streamlit/Gradio app or other frontend-only tools.

The two main projects stored here are:

- **`website`** — the company's public-facing web presence.
- **`backoffice`** — the internal admin application. This is the ideal place to develop multiple solutions within a single project: authentication, people management, operations management, internal communication, and other back-office capabilities.

Organize `uis/` by **different concerns** — each subfolder covers a distinct area of the company (for example, public web vs internal operations) and includes its own technical and functional documentation.

- **Main purpose**: to centralize in a single place all frontend applications that support the company's use cases.
- **Recommendation**: document in this file (or in sub-READMEs) the applications you add, their objective, the technology used, and how to run them.

## Applications in this repository

| App | Goal | Stack | Start | Port |
|---|---|---|---|---|
| [`website/`](./website/README.md) | Nexova public website and talent registration form (Milestone 1) | Astro 7 + Tailwind 4 | `npm run dev` | 4321 |
| [`backoffice/`](./backoffice/README.md) | Internal app: welcome screen and empty dashboard with briefing data | Next.js 16 + TypeScript + Tailwind 4 | `npm run dev` | 3001 |
| [`talent-pipeline-tracker/`](./talent-pipeline-tracker/README.md) | Recruitment pipeline tracker for Selection Operations (Milestone 3) | Next.js 16 + TypeScript + Tailwind 4 | `npm run dev` | 3000 |

> _Estas instrucciones también están disponibles en [español](./README.es.md)._
