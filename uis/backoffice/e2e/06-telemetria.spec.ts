import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Request } from "@playwright/test";

import { API_URL } from "./ports.mjs";

// Telemetría (proyecto "Telemetry – Frontend capture"): los eventos del backoffice llegan
// en lotes al stub POST /telemetry/events, el stub responde 200 con { received: N } y cada
// evento cumple el envelope y el allowlist de docs/telemetry/event-schemas.json.
// Usa el seed de inventario: NXV-IT-001 tiene 12 uds. y min_stock 5.

const SCHEMAS = JSON.parse(
  readFileSync(path.resolve(__dirname, "..", "..", "..", "docs", "telemetry", "event-schemas.json"), "utf8"),
);
const LAPTOP = 'Portátil 14" Business · NXV-IT-001 · Valencia';
const ENDPOINT = `${API_URL}/telemetry/events`;

interface SentEvent {
  event_type: string;
  eventId: string;
  sessionId: string | null;
  userId: string | null;
  requestId: string | null;
  schemaVersion: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

test("los eventos llegan en lotes al stub con el formato del plan", async ({ page }) => {
  const events: SentEvent[] = [];
  const statuses: number[] = [];
  const received: number[] = [];
  page.on("requestfinished", async (request: Request) => {
    if (request.url() !== ENDPOINT || request.method() !== "POST") return;
    const body = JSON.parse(request.postData() ?? "{}");
    events.push(...body.events);
    const response = await request.response();
    if (response) {
      statuses.push(response.status());
      received.push((await response.json()).received);
    }
  });

  // Salida que deja el portátil de 12 a 4 uds.: cruza el mínimo (5)
  await page.goto("/inventory/orders/outbound");
  await page.getByLabel("Activo").selectOption({ label: LAPTOP });
  await expect(page.getByTestId("available-stock-value")).toHaveText("12 uds.");
  await page.getByLabel("Cantidad").fill("8");
  await page.getByRole("radio", { name: "Asignación a empleado" }).check();
  await page.getByLabel("Asignado a (empleado)").fill("Persona Telemetría E2E");
  await page.getByLabel("Destinatario").selectOption({ label: "Agente de soporte" });
  await page.getByRole("button", { name: "Registrar salida" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salida registrada" })).toBeVisible();

  // La cola se envía sola a los 10 s (antes de navegar: al salir de la página se usaría
  // sendBeacon, que Playwright no asocia a la página)
  await expect.poll(() => events.map((e) => e.event_type), { timeout: 20_000 }).toEqual(
    expect.arrayContaining(["page_viewed", "outbound_order_created", "stock_threshold_triggered"]),
  );

  // Intento de fijar el stock a mano: la API lo rechaza y se explica al usuario
  await page.goto("/inventory/products");
  await page.getByRole("button", { name: "Ajustar el stock de Portátil 14\" Business (NXV-IT-001)" }).click();
  await page.getByLabel("Nuevo stock de NXV-IT-001").fill("50");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("direct-stock-edit-error")).toContainText(
    "El stock no se puede modificar directamente",
  );
  await expect(page.locator('[data-sku="NXV-IT-001"]').getByTestId("current-stock")).toHaveText("4");

  await expect.poll(() => events.map((e) => e.event_type), { timeout: 20_000 }).toEqual(
    expect.arrayContaining([
      "page_viewed",
      "outbound_order_created",
      "stock_threshold_triggered",
      "direct_stock_edit_rejected",
    ]),
  );

  // El stub respondió 200 con el número de eventos de cada lote
  expect(statuses.every((s) => s === 200)).toBe(true);
  expect(received.reduce((a, b) => a + b, 0)).toBe(events.length);

  for (const event of events) {
    const definition = SCHEMAS.definitions[event.event_type];
    expect(definition, `event_type desconocido: ${event.event_type}`).toBeTruthy();
    const props = definition.allOf[1].properties.properties;
    for (const key of Object.keys(event.properties)) {
      expect(props.properties, `${event.event_type}.${key} fuera del allowlist`).toHaveProperty(key);
    }
    for (const key of props.required) {
      expect(event.properties, `${event.event_type} sin ${key}`).toHaveProperty(key);
    }
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.timestamp).toMatch(/Z$/);
    expect(event.schemaVersion).toBe("1.0.0");
  }

  const outbound = events.find((e) => e.event_type === "outbound_order_created")!;
  expect(outbound.userId).toMatch(/^[0-9a-f-]{36}$/);
  expect(outbound.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(outbound.properties).toMatchObject({
    office: "valencia",
    product_category: "onboarding_equipment",
    programme_id: "onboarding-soporte",
    quantity: 8,
    currency: "EUR",
    recipient_type: "support_agent",
    stock_after: 4,
  });
  const threshold = events.find((e) => e.event_type === "stock_threshold_triggered")!;
  expect(threshold.properties).toMatchObject({ min_stock: 5, stock_before: 12, stock_after: 4 });
  const rejected = events.find((e) => e.event_type === "direct_stock_edit_rejected")!;
  expect(rejected.properties).toMatchObject({ http_method: "PATCH", status_code: 405, rejected_fields: ["current_stock"] });

  // Sin datos personales: el nombre de quien recibe nunca sale del formulario
  expect(JSON.stringify(events)).not.toContain("Persona Telemetría E2E");
});
