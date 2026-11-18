import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

// Reporte técnico (GET /telemetry/report) en /telemetria. Los eventos los han generado los
// specs anteriores y los ha guardado el receptor real en la BD de e2e.
const SCREENSHOTS_DIR = path.resolve(__dirname, "..", "..", "..", "docs", "screenshots", "telemetry");
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

test("el reporte técnico muestra el período y las métricas operacionales", async ({ page }) => {
  await page.goto("/telemetria");
  await expect(page.getByRole("heading", { name: "Telemetría técnica", level: 1 })).toBeVisible();
  await expect(page.getByTestId("report-period")).toContainText("Período:");

  for (const title of [
    "Volumen de eventos por día",
    "Tasa de errores y avisos por día",
    "Carga de páginas (LCP)",
    "Fallos de login por día",
  ]) {
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  }
  // Los specs anteriores han generado vistas de página y órdenes: hay volumen
  await expect(page.getByText("page_viewed").first()).toBeAttached();
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "reporte-tecnico.png"), fullPage: true });
});
