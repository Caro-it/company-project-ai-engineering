import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { SCREENSHOTS_DIR, delay, fulfillJson, mockApi } from "./helpers";

const rows = (page: Page) => page.getByTestId("incident-row");

function firstRowWithStatus(page: Page, status: string) {
  return rows(page)
    .filter({
      has: page.getByTestId("incident-status").getByText(status, { exact: true }),
    })
    .first();
}

test("carga el listado con datos", async ({ page }) => {
  await page.goto("/incidencias");
  const list = page.getByTestId("incidents-list");
  await expect(list).toHaveAttribute("aria-busy", "false");
  await expect(rows(page)).toHaveCount(96);
  await expect(page.getByText("96 incidencias", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Central — Sede Valencia");

  // Captura desde los filtros: se ven los filtros y las primeras filas de la tabla
  await page
    .getByRole("heading", { name: "Filtros" })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "listado.png") });
});

test("filtra y distingue el vacío por filtros", async ({ page }) => {
  await page.goto("/incidencias");
  await expect(rows(page)).toHaveCount(96);

  await page.getByLabel("Estado", { exact: true }).selectOption({ label: "Abierta" });
  await expect(rows(page)).toHaveCount(27);
  await page.getByLabel("Categoría", { exact: true }).selectOption({ label: "Queja de cliente" });
  await expect(rows(page).first()).toBeVisible();
  for (const badge of await page.getByTestId("incident-status").allTextContents()) {
    expect(badge).toBe("Abierta");
  }

  // Todo el seed es de la sede central: con «Remoto» no hay resultados
  await page.getByLabel("Sede", { exact: true }).selectOption({ label: "Remoto (empleado sin sede fija)" });
  await expect(page.getByText("Ninguna incidencia coincide con los filtros elegidos.")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  await page
    .getByTestId("incidents-list")
    .getByRole("button", { name: "Limpiar filtros" })
    .click();
  await expect(rows(page)).toHaveCount(96);
});

test("si el listado falla, muestra el error y permite reintentar", async ({ page }) => {
  let fail = true;
  await mockApi(page, "/api/incidents", "GET", async (route) => {
    if (fail) {
      await fulfillJson(route, 500, { detail: "Error interno del servidor", code: "internal_error" });
    } else {
      await route.continue();
    }
  });
  await page.goto("/incidencias");

  const alert = page.getByTestId("incidents-list").getByRole("alert");
  await expect(alert).toContainText(
    "No se ha podido cargar el listado. Ha ocurrido un error en el servidor.",
  );
  await expect(alert).not.toContainText("500");

  fail = false;
  await alert.getByRole("button", { name: "Reintentar" }).click();
  await expect(rows(page)).toHaveCount(96);
});

test("cambia el estado con una transición permitida", async ({ page }) => {
  await page.goto("/incidencias");
  const row = firstRowWithStatus(page, "Abierta");
  const id = await row.getAttribute("data-incident-id");
  const select = row.getByRole("combobox");

  // Solo ofrece las transiciones permitidas desde «Abierta»
  await expect(select.locator("option")).toHaveText(["Cambiar a…", "En curso", "Descartada"]);
  await select.selectOption({ label: "En curso" });

  const sameRow = page.locator(`[data-incident-id="${id}"]`);
  await expect(sameRow.getByTestId("incident-status")).toHaveText("En curso");
  // El resumen se recarga tras el cambio
  await expect(page.getByTestId("incidents-stats")).toContainText("En curso1");

  // Persistido en la API
  await page.reload();
  await expect(
    page.locator(`[data-incident-id="${id}"]`).getByTestId("incident-status"),
  ).toHaveText("En curso");
});

test("si el cambio de estado falla, vuelve al estado anterior y avisa", async ({ page }) => {
  await mockApi(page, /^\/api\/incidents\/[^/]+\/status$/, "PATCH", async (route) => {
    await delay(800);
    await fulfillJson(route, 400, {
      detail: "No se puede pasar de «open» a «discarded»",
      code: "invalid_transition",
      from: "open",
      to: "discarded",
      allowed: ["in_progress"],
    });
  });
  await page.goto("/incidencias");
  const row = firstRowWithStatus(page, "Abierta");
  const id = await row.getAttribute("data-incident-id");
  const sameRow = page.locator(`[data-incident-id="${id}"]`);

  await row.getByRole("combobox").selectOption({ label: "Descartada" });
  // Optimista: se ve el estado nuevo mientras la API responde…
  await expect(sameRow.getByTestId("incident-status")).toHaveText("Descartada");
  // …y vuelve al anterior con el motivo traducido
  await expect(sameRow.getByTestId("incident-status")).toHaveText("Abierta");
  await expect(sameRow.getByRole("alert")).toHaveText(
    "No se ha cambiado el estado. No se puede pasar de «Abierta» a «Descartada».",
  );
});
