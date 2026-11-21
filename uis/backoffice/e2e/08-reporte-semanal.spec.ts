import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { API_URL } from "./ports.mjs";

// Dashboard de negocio (Hito 6, parte 3): el pipeline de Prefect calcula la semana a partir
// de los eventos que han generado los specs anteriores (entre ellos la salida de 8 portátiles
// de 06-telemetria, que cruzó el mínimo) y /reporting los muestra con los nombres de KPI del
// BRIEFING.
const SCREENSHOTS_DIR = path.resolve(__dirname, "..", "..", "..", "docs", "screenshots", "reporting");
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

test("el reporte semanal muestra los cuatro KPIs del BRIEFING por oficina y programa", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  // Disparo manual como admin (el usuario de test no puede) y espera a que termine
  const login = await request.post(`${API_URL}/auth/login`, {
    form: { username: "e2e-admin@example.com", password: "Password123" },
  });
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const trigger = await request.post(`${API_URL}/reporting/pipeline-runs`, { headers });
  expect(trigger.status()).toBe(202);
  const { run_id: runId } = await trigger.json();
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/reporting/pipeline-runs/latest`, { headers });
        const run = await res.json();
        return run.run_id === runId ? run.status : "pending";
      },
      { timeout: 90_000, intervals: [2_000] },
    )
    .toBe("completed");

  await page.goto("/reporting");
  await expect(
    page.getByRole("heading", { name: "Reporte Semanal de Desempeño por Oficina y Programa", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("report-week")).toContainText("semana del");

  for (const title of [
    "Costo de material por oficina/programa",
    "Kits entregados",
    "Frecuencia de escasez",
    "Frecuencia de variación de costo",
  ]) {
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  }

  // 06-telemetria: salida de 8 portátiles de Valencia (programa onboarding-soporte) que cruzó el mínimo
  const shortage = page.getByTestId("kpi-shortage_events_count-row").filter({ hasText: "Valencia" }).filter({ hasText: "Onboarding soporte" });
  await expect(shortage.first()).toContainText("Valencia");
  await expect(page.getByTestId("kpi-kits_delivered_count-row").first()).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "reporte-semanal.png"), fullPage: true });
});
