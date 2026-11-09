import path from "node:path";

import { expect, test } from "@playwright/test";

const CSV = path.resolve(__dirname, "..", "..", "..", "scripts", "incidents-nexova.csv");

test("el analizador de CSV funciona en su nueva ruta", async ({ page }) => {
  // Se llega desde el menú lateral
  await page.goto("/incidencias");
  await page.getByRole("link", { name: "Análisis de incidencias (CSV)" }).click();
  await expect(page).toHaveURL("/incidencias/analizador");
  await expect(page.getByRole("heading", { name: "Análisis de incidencias", level: 1 })).toBeVisible();

  await page.locator("#csv-file").setInputFiles(CSV);
  await page.getByRole("button", { name: "Analizar fichero" }).click();

  await expect(page.getByRole("status")).toContainText("El fichero contiene 4 registros inválidos");
  await expect(page.getByRole("button", { name: /Descargar/ })).toBeVisible();
});
