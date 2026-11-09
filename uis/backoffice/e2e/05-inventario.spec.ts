import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { fulfillJson, mockApi } from "./helpers";

// Inventario de Nexova (Hito 5, NXV-0201). La API de e2e usa un SQLite temporal sembrado
// con seed-inventory (e2e/start-api.mjs): nunca Supabase.
// Stock del seed: NXV-IT-001 12 · NXV-IT-002 8 · NXV-PER-001 0 · NXV-PER-002 4 ·
// NXV-OFF-001 16 · NXV-TRN-001 0

const SCREENSHOTS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "screenshots",
  "inventory-backoffice",
);
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const SEED_STOCK: Record<string, number> = {
  "NXV-IT-001": 12,
  "NXV-IT-002": 8,
  "NXV-PER-001": 0,
  "NXV-PER-002": 4,
  "NXV-OFF-001": 16,
  "NXV-TRN-001": 0,
};

const HUB = "Hub USB-C · NXV-PER-002 · Miami";
const PAPER = "Resma de papel A4 · NXV-OFF-001 · Valencia";

test.describe("sin sesión", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of [
    "/inventory/products",
    "/inventory/orders/inbound",
    "/inventory/orders/outbound",
    "/inventory/orders",
  ]) {
    test(`${route} redirige al login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL("/login");
    });
  }
});

test("stock de activos: datos del seed con su nivel y acciones por fila", async ({ page }) => {
  await page.goto("/inventory/products");
  await expect(page.getByRole("heading", { name: "Stock de activos", level: 1 })).toBeVisible();

  const rows = page.getByTestId("asset-row");
  await expect(rows).toHaveCount(6);
  for (const [sku, stock] of Object.entries(SEED_STOCK)) {
    const row = page.locator(`[data-testid="asset-row"][data-sku="${sku}"]`);
    await expect(row.getByTestId("current-stock")).toHaveText(String(stock));
  }

  const paper = page.locator('[data-sku="NXV-OFF-001"]');
  await expect(paper.getByTestId("stock-level")).toHaveText(/Stock correcto/);
  await expect(page.locator('[data-sku="NXV-PER-001"]').getByTestId("stock-level")).toHaveText(
    /Agotado/,
  );
  await expect(page.locator('[data-sku="NXV-IT-001"]').getByTestId("stock-level")).toHaveText(
    /Stock justo/,
  );
  await expect(paper).toContainText("Material de oficina");

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "stock-activos.png"), fullPage: true });

  // La acción de salida de una fila llega al formulario con el activo elegido
  await page.getByRole("link", { name: "Registrar salida de Hub USB-C (NXV-PER-002)" }).click();
  await expect(page).toHaveURL(/\/inventory\/orders\/outbound\?asset_id=\d+/);
  await expect(page.getByLabel("Activo")).toHaveValue(/\d+/);
  await expect(page.getByTestId("available-stock-value")).toHaveText("4 uds.");
});

test("salida: stock reactivo, aviso en cliente y 400 de la API junto a la cantidad", async ({
  page,
}) => {
  await page.goto("/inventory/orders/outbound");
  await expect(page.getByTestId("available-stock")).toContainText("Elige un activo");

  // El stock cambia con la selección, antes de escribir la cantidad
  await page.getByLabel("Activo").selectOption({ label: HUB });
  await expect(page.getByTestId("available-stock-value")).toHaveText("4 uds.");
  await expect(page.getByTestId("order-office")).toHaveText("Miami");
  await page.getByLabel("Activo").selectOption({ label: PAPER });
  await expect(page.getByTestId("available-stock-value")).toHaveText("16 uds.");
  await expect(page.getByTestId("order-office")).toHaveText("Valencia");

  // Aviso en cliente al superar el stock (no bloquea: la regla la aplica la API)
  await page.getByLabel("Cantidad").fill("999");
  await expect(page.locator("#f-quantity-warning")).toContainText("supera el stock disponible");

  // «Asignado a» solo aparece en asignaciones y es obligatorio
  await expect(page.getByLabel("Asignado a (empleado)")).toHaveCount(0);
  await page.getByRole("radio", { name: "Asignación a empleado" }).check();
  await page.getByRole("button", { name: "Registrar salida" }).click();
  await expect(page.locator("#f-assigned-to-error")).toHaveText(
    "Indica a qué empleado se asigna (nombre o ID).",
  );
  await expect(page.getByLabel("Asignado a (empleado)")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Asignado a (empleado)").fill("Prueba e2e");
  await page.getByRole("button", { name: "Registrar salida" }).click();

  // 400 real de la API, con su mensaje, junto al campo cantidad
  const stockError = page.locator("#f-quantity-api-error");
  await expect(stockError).toHaveText(
    "Insufficient stock for asset 'Resma de papel A4'. Available: 16, requested: 999.",
  );
  await expect(stockError).toHaveAttribute("role", "alert");
  await expect(page.getByLabel("Cantidad")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Cantidad")).toHaveAttribute(
    "aria-describedby",
    /f-quantity-api-error/,
  );
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, "salida-stock-insuficiente.png"),
    fullPage: true,
  });

  // Al pasar a consumo, «Asignado a» desaparece
  await page.getByRole("radio", { name: "Consumo" }).check();
  await expect(page.getByLabel("Asignado a (empleado)")).toHaveCount(0);
});

test("salida: un 422 de la API se muestra legible, sin texto de Pydantic", async ({ page }) => {
  await mockApi(page, "/inventory/orders/outbound", "POST", (route) =>
    fulfillJson(route, 422, {
      detail: [{ loc: ["body", "quantity"], msg: "Input should be greater than 0", type: "greater_than" }],
    }),
  );
  await page.goto("/inventory/orders/outbound");
  await page.getByLabel("Activo").selectOption({ label: PAPER });
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("radio", { name: "Consumo" }).check();
  await page.getByRole("button", { name: "Registrar salida" }).click();

  await expect(page.getByTestId("form-error")).toHaveText(
    "No se pudo registrar la salida: Revisa estos campos: Cantidad.",
  );
  await expect(page.getByLabel("Cantidad")).toHaveAttribute("aria-invalid", "true");
});

test("salida: un consumo correcto actualiza el stock mostrado", async ({ page }) => {
  await page.goto("/inventory/orders/outbound");
  await page.getByLabel("Activo").selectOption({ label: PAPER });
  await expect(page.getByTestId("available-stock-value")).toHaveText("16 uds.");
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("radio", { name: "Consumo" }).check();
  await page.getByRole("button", { name: "Registrar salida" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Salida registrada" })).toContainText(
    "consumo de 2 uds.",
  );
  await expect(page.getByTestId("available-stock-value")).toHaveText("14 uds.");
  await expect(page.getByLabel("Cantidad")).toHaveValue("");
});

test("entrada: obligatorios, error de la API visible y alta correcta", async ({ page }) => {
  await page.goto("/inventory/orders/inbound");
  await expect(page.getByRole("heading", { name: "Entrada de activos", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.locator("#f-asset-error")).toHaveText("Elige un activo.");
  await expect(page.locator("#f-quantity-error")).toBeVisible();
  await expect(page.locator("#f-supplier-error")).toBeVisible();

  await page.getByLabel("Activo").selectOption({ label: HUB });
  await expect(page.getByTestId("order-office")).toHaveText("Miami");
  await page.getByLabel("Cantidad recibida").fill("3");
  await page.getByLabel("Proveedor").fill("Office Depot Miami");

  // Un 500 se explica sin texto técnico y no borra los datos
  await mockApi(page, "/inventory/orders/inbound", "POST", (route) =>
    fulfillJson(route, 500, { detail: "Internal Server Error" }),
  );
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByTestId("form-error")).toHaveText(
    "No se pudo registrar la entrada: Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.",
  );
  await expect(page.getByLabel("Proveedor")).toHaveValue("Office Depot Miami");
  await page.unrouteAll();

  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Entrada registrada" })).toContainText(
    `3 uds. de ${HUB}, de Office Depot Miami`,
  );
  await expect(page.getByLabel("Activo")).toHaveValue("");
  await expect(page.getByLabel("Cantidad recibida")).toHaveValue("");
  await expect(page.getByLabel("Proveedor")).toHaveValue("");
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "entrada-registrada.png"), fullPage: true });

  await page.goto("/inventory/products");
  await expect(
    page.locator('[data-sku="NXV-PER-002"]').getByTestId("current-stock"),
  ).toHaveText("7");
});

test("historial: entradas y salidas distinguidas, con activo, fecha y user_uuid", async ({
  page,
}) => {
  await page.goto("/inventory/orders");
  await expect(page.getByRole("heading", { name: "Historial de órdenes", level: 1 })).toBeVisible();

  const rows = page.getByTestId("order-row");
  // 8 del seed + la salida y la entrada de los tests anteriores
  await expect(rows).toHaveCount(10);
  await expect(page.locator('[data-order-type="inbound"]')).toHaveCount(6);
  await expect(page.locator('[data-order-type="outbound"]')).toHaveCount(4);

  const first = rows.first();
  await expect(first).toContainText(/Entrada|Salida/);
  await expect(first.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
  await expect(first.locator("td").last()).toHaveText(/^[0-9a-f-]{36}$/);

  // Solo lectura: ni botones ni enlaces de editar o borrar en la tabla
  await expect(page.locator("table").getByRole("button")).toHaveCount(0);
  await expect(page.locator("table").getByRole("link")).toHaveCount(0);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "historial-ordenes.png"), fullPage: true });
});

test("un fallo al cargar el stock muestra el error con reintento", async ({ page }) => {
  await mockApi(page, "/inventory/products", "GET", (route) =>
    fulfillJson(route, 500, { detail: "boom" }),
  );
  await page.goto("/inventory/products");
  // Filtrado por texto: Next añade su propio role="alert" vacío (anunciador de rutas)
  const alert = page.getByRole("alert").filter({ hasText: "Ha ocurrido un error en el servidor" });
  await expect(alert).toBeVisible();
  await page.unrouteAll();
  await alert.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByTestId("asset-row")).toHaveCount(6);
});
