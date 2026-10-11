---
name: nexova-domain
description: Datos de empresa de Nexova que cualquier interfaz, documento o código del repo debe respetar
scope: always
---

# Regla: datos de dominio de Nexova

**Alcance:** siempre activa, en cualquier archivo y tarea del repo.

## Datos fijos (fuente: [`CONTEXT.md`](../../CONTEXT.md))

- **Nombre completo:** "Nexova Solutions". **Marca corta:** "Nexova". La web pública y su JSON-LD usan "Nexova" y no se cambian.
- Fundada en **2011**. Sede en **Valencia (España)**, oficina de expansión en **Miami (Florida, EE. UU.)**.
- 120 empleados; unos 8 M$ de facturación anual.
- Líneas de negocio: headhunting de mandos medios y directivos, outsourcing de soporte al cliente para empresas tecnológicas y formación corporativa en habilidades blandas y liderazgo.
- Sectores de clientes: tecnología, retail y servicios financieros.

## Prohibido

- **Mencionar Chile o Argentina** en producto, código o documentación de producto. Esa referencia viene del placeholder del template y es obsoleta.
- **Mostrar en cualquier interfaz el nombre del responsable de Ventas.** El briefing dice "Megan Clarke" en un apartado y "Marcos Ibáñez" en otro, y está pendiente de confirmar con el mentor (ver `memory-bank/projectbrief.md`).
- Inventar cifras, nombres, KPIs o clientes que no estén en `CONTEXT.md`. Si una pantalla necesita un dato que no existe, se muestra como "sin datos" o se pregunta.
- Resolver por tu cuenta una contradicción del briefing. Se registra en `memory-bank/projectbrief.md`.

## Reutilización de tipos

- Los valores de dominio ya tipados en `packages/shared/src/types/models.ts` (`Sector`, `NivelIngles`, `Disponibilidad`, `LineaServicio`, `Oficina`, `EstadoCandidatura`…) se importan **por ruta relativa** en lugar de redefinirse.
- `packages/shared/` está protegido: no se edita sin confirmación.

## Comprobación

```bash
git grep -nE 'Chile|Argentina' -- uis services packages        # vacío
git grep -nE 'Megan Clarke|Marcos Ibáñez' -- uis services       # vacío
```
