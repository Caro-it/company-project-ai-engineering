# AGENTS.md — Monorepo Nexova (AI Engineering · 4Geeks Academy)

Instrucciones para cualquier agente de IA (Claude Code, Cursor, Codex…) que trabaje en este repositorio. `CLAUDE.md` solo importa este archivo.

## Fuentes de verdad

| Qué | Archivo |
|---|---|
| Negocio de Nexova (áreas, responsables, problemas, necesidades) | [`CONTEXT.md`](./CONTEXT.md) |
| Textos literales de la web pública (hero, servicios, formulario, errores, éxito, JSON-LD) | [`docs/CONTEXT-hito1-website.md`](./docs/CONTEXT-hito1-website.md) |

Si cualquier otro archivo (incluido este) contradice a esas fuentes, ganan ellas. **No se parafrasean, no se traducen y no se "mejoran".** Si el propio briefing se contradice, no elijas tú: anota el caso en `memory-bank/projectbrief.md` como "pendiente de confirmar con el mentor".

## 1. Al inicio de cada sesión

Lee, en este orden:

1. [`memory-bank/projectbrief.md`](./memory-bank/projectbrief.md): qué es Nexova, qué problema resolvemos y las contradicciones abiertas del briefing.
2. [`memory-bank/techContext.md`](./memory-bank/techContext.md): stack real, puertos, decisiones de los Hitos 1–3 y restricciones técnicas.
3. [`memory-bank/progress.md`](./memory-bank/progress.md): estado actual, próximos pasos y deuda técnica.

Después, según la tarea:

- Si toca negocio o datos de dominio: [`CONTEXT.md`](./CONTEXT.md).
- Si toca `uis/website/`: [`docs/CONTEXT-hito1-website.md`](./docs/CONTEXT-hito1-website.md) y la regla [`.agents/rules/website.md`](./.agents/rules/website.md).
- Si toca `uis/talent-pipeline-tracker/`: su propio [`AGENTS.md`](./uis/talent-pipeline-tracker/AGENTS.md). Además, la carpeta está protegida.
- Siempre: las reglas de [`.agents/rules/`](./.agents/rules/) que apliquen según su alcance.

## 2. Flujo obligatorio antes de cada commit

Ejecútalo desde la raíz del repo, en orden, después de `git add`. Los comandos funcionan igual en PowerShell 5.1 y en Git Bash. Si un paso falla, no se commitea: se corrige y se vuelve a empezar desde el paso 1.

1. **Revisar el alcance del commit.**
   `git diff --cached --stat`
   Solo deben aparecer los archivos de la tarea. Un commit pequeño cubre un único tema.

2. **Ningún archivo protegido sin confirmación.**
   `git diff --cached --name-only -- CONTEXT.md CONTEXT.es.md docs/CONTEXT-hito1-website.md uis/talent-pipeline-tracker packages/shared .devcontainer`
   Salida esperada: **vacía**. Si aparece algo, hace falta la confirmación explícita de la usuaria en esta conversación.

3. **Codificación y espacios.**
   `git grep --cached -lP '\x{FEFF}' -- . ':!uis/talent-pipeline-tracker'` → salida **vacía** (UTF-8 sin BOM).
   `git diff --cached --check` → salida **vacía** (sin espacios finales ni marcadores de conflicto).

4. **Datos de dominio.**
   `git grep --cached -nE 'Chile|Argentina' -- uis services packages` → salida **vacía**.
   `git grep --cached -nE 'aplicacion\.html|validacion\.js' -- uis` → salida **vacía**.

5. **Tipos compartidos.**
   `npm --prefix packages/shared run typecheck` → código de salida 0.

6. **Build de cada app tocada en el commit.**
   - `uis/website`:
     - `npm --prefix uis/website run build` → código 0.
     - `node .agents/skills/verify-website-literals/scripts/check-literals.mjs` → última línea `OK: N/N comprobaciones`.
   - `uis/backoffice`: `npm --prefix uis/backoffice run lint` y `npm --prefix uis/backoffice run build` → código 0 en ambos.

7. **Memoria al día.** Si el commit cambia el estado del proyecto, `memory-bank/progress.md` va en el mismo commit o en el siguiente `docs:`:
   `git diff --cached --name-only -- memory-bank`

8. **Mensaje del commit.** Usa un prefijo convencional, como en el historial: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`. Describe en inglés, en imperativo y en una línea qué hace (p. ej. `feat: add backoffice welcome dashboard`).

## 3. No se modifica sin confirmación explícita

| Ruta | Motivo |
|---|---|
| `CONTEXT.md` | Briefing de negocio, fuente de verdad |
| `CONTEXT.es.md` | Remite a `CONTEXT.md` |
| `docs/CONTEXT-hito1-website.md` | Fuente de los textos literales de la web |
| `uis/talent-pipeline-tracker/` | Entrega cerrada del Hito 3, con su propio `AGENTS.md` y `CLAUDE.md` |
| `packages/shared/` | Entrega cerrada del Hito 2; se consume por ruta relativa |
| `.devcontainer/` | Entorno compartido de Codespaces |

Tampoco, sin confirmación: hacer push a `main`, usar `--force` o reescribir el historial publicado.

## 4. Convenciones del monorepo

- Interfaz visual → `uis/<app>/`. API o worker → `services/<servicio>/`: una única app FastAPI centralizada (`services/api`), prevista para el hito de backend. Código que comparten dos o más carpetas → `packages/`.
- Cada app o servicio nuevo lleva su propio `README.md` (objetivo, stack, cómo ejecutarlo, puerto) y se lista en `uis/README.md` o `services/README.md`.
- `skills/` es **código de producto** (skills de los agentes de Nexova). La infraestructura de los agentes que desarrollan el repo vive en `.agents/`.
- npm, un lockfile por proyecto, sin workspace en la raíz. Puertos fijos: tracker 3000, backoffice 3001, website 4321.
- Archivos en UTF-8 sin BOM. En PowerShell 5.1 no se usa `Set-Content` ni `Out-File` para escribir archivos del repo.

## 5. Infraestructura de agentes

- [`.agents/rules/`](./.agents/rules/): reglas con alcance declarado en su cabecera (`always`, `glob` o `agent-requested`).
- [`.agents/skills/`](./.agents/skills/): procedimientos repetibles con inputs y criterios de aceptación.
  - [`verify-website-literals`](./.agents/skills/verify-website-literals/SKILL.md): comprueba que la web contiene los textos literales del briefing.
