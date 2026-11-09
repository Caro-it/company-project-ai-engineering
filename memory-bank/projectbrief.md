# Project brief — Nexova

> Fuente: [`CONTEXT.md`](../CONTEXT.md) (briefing de negocio). Si este archivo y `CONTEXT.md` discrepan, gana `CONTEXT.md`.

## La empresa

- **Nombre completo:** Nexova Solutions. **Marca corta:** Nexova (es la que usa la web pública).
- Consultora de recursos humanos y selección de talento fundada en **2011**.
- Sede en **Valencia (España)** y oficina de expansión en **Miami (Florida, EE.UU.)**. No opera en otros países: cualquier mención a Chile o Argentina viene del placeholder del template y es obsoleta.
- **120 empleados**, unos **8 millones de dólares** de facturación anual.
- Tres líneas de negocio:
  1. Headhunting de mandos medios y directivos.
  2. Outsourcing de equipos de soporte al cliente para empresas tecnológicas.
  3. Formación corporativa en habilidades blandas y liderazgo.
- Clientes: medianas empresas de **tecnología, retail y servicios financieros** que externalizan parte o toda su gestión de talento.

## Áreas y responsables

| Área | Responsable | Equipo | Problema principal |
|---|---|---|---|
| Dirección Ejecutiva | Laura Mendoza (CEO) | — | Informe semanal en PDF hecho a mano (4–8 h por manager), datos con una semana de retraso |
| Operaciones de Selección (negocio principal) | Javier Almeida | 40 consultores | Cribado manual de 30–80 CVs por proceso, sin estado en tiempo real, matching por intuición |
| Formación Corporativa | Elena Vargas | 12 personas | Catálogo en PDF, inscripciones por Google Form + hoja de cálculo, sin personalización |
| Soporte al Cliente Externalizado | Roberto Díaz | 30 agentes | Resolución media de 48 h frente a un SLA de 24 h, sin base de conocimiento |
| Ventas y Desarrollo de Negocio | **pendiente de confirmar** (ver abajo) | 18 personas (6 account managers, 12 SDRs) | HubSpot lo actualiza solo el 40 %, prospección manual, deals perdidos por falta de seguimiento |
| Marketing y Comunicación | Carmen Ruiz | equipo pequeño | Web de 2019 lenta y poco accesible, no saben qué convierte |
| Recursos Humanos (interno) | Patricia Solís | 4 personas | Vacaciones, onboarding y evaluaciones por email, hojas de cálculo y Google Forms, sin KPIs |
| Tecnología e Infraestructura | Sergio Molina (CTO) | 6 personas | HubSpot, Zendesk legacy, ATS propio de los 2010 y Google Workspace desconectados; sin telemetría ni logging; despliegues manuales |

## Problema que resuelve el proyecto

Nexova tiene reputación y una red de candidatos y clientes construida durante doce años, pero **no tiene infraestructura para operar a escala**: casi todo es manual y los datos llegan tarde. Nuevas plataformas automatizadas compiten directamente con ella. El equipo de AI Engineering construye los sistemas, las automatizaciones y las herramientas de IA que permitan a Nexova hacer lo mismo más rápido, a mayor escala y con menos esfuerzo manual.

## Objetivos del proyecto (monorepo)

- **Hito 1** (hecho): web pública para Marketing (Carmen Ruiz) con formulario de registro de talento. Contexto literal en [`docs/CONTEXT-hito1-website.md`](../docs/CONTEXT-hito1-website.md).
- **Hito 2** (hecho): capa de lógica TypeScript del dominio de selección en `packages/shared`.
- **Hito 3** (hecho): Talent Pipeline Tracker para Operaciones de Selección (`uis/talent-pipeline-tracker`).
- **Hito actual, "Ingeniería impulsada por IA":** infraestructura de agentes (memory-bank, `AGENTS.md`, `.agents/`), la web en `uis/website` sobre Astro y un `uis/backoffice` interno.
- **Reto de IA elegido** ([`company-choice.md`](../company-choice.md)): pipeline de scoring y ranking explicable de CVs con RAG sobre la base de candidatos (p. ej. "perfiles con experiencia en ventas B2B y nivel C1 de inglés"), para Operaciones de Selección.

## Contradicciones del briefing — pendiente de confirmar con el mentor

No se resuelven por nuestra cuenta. Mientras no haya confirmación, el dato dudoso no se muestra en ninguna interfaz.

1. **Responsable de Ventas:** "Organización" dice **Megan Clarke**; la ficha del departamento dice **Marcos Ibáñez**. *Pendiente de confirmar con el mentor.*
2. **Años de experiencia:** el briefing habla de "doce años" (2011 + 12 = 2023). La web del Hito 1 dice "12 años de experiencia en el mercado latinoamericano" aunque Nexova opera en España y EE. UU. Es texto literal de `docs/CONTEXT-hito1-website.md` y se copia tal cual, sin corregirlo.
3. **Nombre:** el briefing dice "Nexova Solutions" y la web y el JSON-LD dicen "Nexova". Decisión: "Nexova Solutions" es el nombre completo y "Nexova" la marca corta. El JSON-LD no se toca.
4. **Etiquetas del gestor de incidencias:** `docs/CONTEXT-incident-manager-nexova.md` da "nombre para mostrar" solo para las sedes (`branch`). Para estados, orígenes y categorías solo hay una columna de significado o descripción, no una etiqueta corta. En la API (`incident_model.py`) la etiqueta sigue siendo el propio valor (`open`, `technical_failure`…). En el backoffice, la usuaria decidió en la fase 3 usar textos de interfaz cortos en español (`STATUS_LABELS`, `ORIGIN_LABELS` y `CATEGORY_LABELS` en `uis/backoffice/lib/incidents.ts`). Si el mentor da etiquetas oficiales, se cambian ahí. *Pendiente de confirmar con el mentor.*
