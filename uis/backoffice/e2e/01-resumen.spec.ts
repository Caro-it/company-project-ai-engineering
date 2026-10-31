import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { SCREENSHOTS_DIR, fulfillJson, mockApi } from "./helpers";

// Va primero: los totales son los del seed, antes de que otros specs cambien datos.

function statsPanel(page: Page): Locator {
  return page.getByTestId("incidents-stats");
}

// Valor de una fila ("Abierta" → 27) dentro de un bloque ("Por estado")
function statValue(page: Page, block: string, label: string): Locator {
  return statsPanel(page)
    .locator("div.rounded-lg")
    .filter({ has: page.getByRole("heading", { name: block, exact: true }) })
    .locator("div")
    .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) })
    .locator("dd");
}

test("el resumen muestra los totales del seed", async ({ page }) => {
  await page.goto("/incidencias");
  const stats = statsPanel(page);
  await expect(stats).toHaveAttribute("aria-busy", "false");
  await expect(stats).toContainText("96 incidencias en total");

  const expected: [string, string, string][] = [
    ["Por estado", "Abierta", "27"],
    ["Por estado", "En curso", "0"],
    ["Por estado", "Resuelta", "56"],
    ["Por estado", "Descartada", "13"],
    ["Por categoría", "Fallo técnico", "49"],
    ["Por categoría", "Error de proceso", "35"],
    ["Por categoría", "Queja de cliente", "12"],
    ["Por categoría", "Incumplimiento de SLA", "0"],
    ["Por origen", "Cliente", "96"],
    ["Por sede", "Central — Sede Valencia", "96"],
    ["Por sede", "Remoto \\(empleado sin sede fija\\)", "0"],
  ];
  for (const [block, label, value] of expected) {
    await expect(statValue(page, block, label)).toHaveText(value);
  }

  await stats.screenshot({
    path: path.join(SCREENSHOTS_DIR, "resumen-metricas.png"),
  });
});

test("si /summary falla, el listado sigue funcionando", async ({ page }) => {
  await mockApi(page, "/api/incidents/summary", "GET", (route) =>
    fulfillJson(route, 500, {
      detail: "Error interno del servidor",
      code: "internal_error",
    }),
  );
  await page.goto("/incidencias");

  await expect(statsPanel(page).getByRole("alert")).toContainText(
    "No se ha podido cargar el resumen. Ha ocurrido un error en el servidor.",
  );
  await expect(
    statsPanel(page).getByRole("button", { name: "Reintentar" }),
  ).toBeVisible();

  // El listado carga y filtra con normalidad
  await expect(page.getByTestId("incident-row")).toHaveCount(96);
  await page.getByLabel("Estado", { exact: true }).selectOption({ label: "Abierta" });
  await expect(page.getByTestId("incident-row")).toHaveCount(27);
});
