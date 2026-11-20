// TelemetryService (lib/telemetry.ts) y traducción de eventos (lib/telemetryTrackers.ts).
// Contrato: docs/telemetry/event-schemas.json.
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  TELEMETRY_EVENT_KEYS,
  TELEMETRY_SCHEMA_VERSION,
} from "@/lib/telemetryEvents.generated";

const ENDPOINT = "http://localhost:8000/telemetry/events";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ID = "5b2e8f1c-3d4a-4f6b-9e7c-8a1d2c3b4e5f";

type Telemetry = typeof import("@/lib/telemetry");
type Trackers = typeof import("@/lib/telemetryTrackers");

let telemetry: Telemetry;
let trackers: Trackers;
let fetchMock: jest.Mock;

function fakeJwt(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub, exp: 4_102_444_800 })).toString("base64url");
  return `x.${payload}.y`;
}

function loadModules(endpoint: string | undefined) {
  jest.resetModules();
  if (endpoint === undefined) delete process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
  else process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = endpoint;
  // Se recargan los módulos para que lean NEXT_PUBLIC_TELEMETRY_ENDPOINT de nuevo
  telemetry = jest.requireActual<Telemetry>("@/lib/telemetry");
  trackers = jest.requireActual<Trackers>("@/lib/telemetryTrackers");
}

function okResponse(status = 200) {
  return { ok: status >= 200 && status < 300, status } as Response;
}

const PAGE_VIEW = { page: "/inventory/products", app: "backoffice", ui_locale: "es" } as const;

const ASSET = {
  id: 7,
  name: "Kit ventas B2B",
  sku: "NXV-TRN-007",
  category: "training_materials",
  office: "Valencia",
  programme_id: "ventas-b2b",
  product_category: "training_kit",
  min_stock: 5,
  current_stock: 6,
} as const;

beforeEach(() => {
  jest.useFakeTimers();
  loadModules(ENDPOINT);
  fetchMock = jest.fn().mockResolvedValue(okResponse());
  global.fetch = fetchMock;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("nexova_token", fakeJwt(USER_ID));
});

afterEach(() => {
  telemetry.__resetTelemetryForTests();
  jest.useRealTimers();
});

function sentEvents(callIndex = 0) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body).events;
}

describe("envelope", () => {
  test("track() añade todos los campos del envelope; el componente solo pasa properties", () => {
    telemetry.track("page_viewed", PAGE_VIEW);
    const [event] = telemetry.__queueForTests();

    expect(event.eventId).toMatch(UUID_RE);
    expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(event.sessionId).toMatch(UUID_RE);
    expect(event.userId).toBe(USER_ID);
    expect(event.event_type).toBe("page_viewed");
    expect(event.schemaVersion).toBe("1.0.0");
    expect(event.requestId).toBeNull(); // una vista de página no viene de una petición
    expect(event.source).toBe("backoffice");
    expect(event.environment).toBe("development");
    expect(event.properties).toEqual(PAGE_VIEW);
  });

  test("el timestamp es el de captura, no el de envío", () => {
    jest.setSystemTime(new Date("2026-11-18T10:00:00.000Z"));
    telemetry.track("page_viewed", PAGE_VIEW);
    jest.setSystemTime(new Date("2026-11-18T10:00:09.000Z"));
    jest.advanceTimersByTime(telemetry.FLUSH_INTERVAL_MS);
    expect(sentEvents()[0].timestamp).toBe("2026-11-18T10:00:00.000Z");
  });

  test("sin sesión iniciada, userId es null", () => {
    window.localStorage.clear();
    telemetry.track("login_failed", { reason: "invalid_credentials" });
    expect(telemetry.__queueForTests()[0].userId).toBeNull();
  });

  test("la sesión se mantiene, rota en cada login y caduca tras 30 min sin actividad", () => {
    const first = telemetry.getSessionId(1_000);
    expect(telemetry.getSessionId(2_000)).toBe(first);
    telemetry.startTelemetrySession();
    const afterLogin = telemetry.getSessionId(Date.now());
    expect(afterLogin).not.toBe(first);
    expect(telemetry.getSessionId(Date.now() + telemetry.SESSION_IDLE_MS + 1)).not.toBe(afterLogin);
  });

  test("los eventos que siguen a una respuesta de la API llevan su requestId", () => {
    const requestId = "e4d3c2b1-a098-4f76-8e5d-4c3b2a1f0e9d";
    telemetry.noteRequestId(requestId);
    telemetry.track("login_failed", { reason: "invalid_credentials" });
    telemetry.track("page_viewed", PAGE_VIEW);
    const [login, page] = telemetry.__queueForTests();
    expect(login.requestId).toBe(requestId);
    expect(page.requestId).toBeNull();
  });
});

describe("allowlist", () => {
  test("descarta las claves que no están en el esquema del evento", () => {
    telemetry.track("page_viewed", {
      ...PAGE_VIEW,
      email: "ana@nexova.com",
    } as unknown as typeof PAGE_VIEW);
    expect(telemetry.__queueForTests()[0].properties).toEqual(PAGE_VIEW);
  });

  test("un evento sin sus claves obligatorias no se envía", () => {
    telemetry.track("page_viewed", { page: "/x" } as unknown as typeof PAGE_VIEW);
    expect(telemetry.__queueForTests()).toHaveLength(0);
  });

  test("las claves opcionales a undefined no viajan", () => {
    telemetry.track("page_viewed", { ...PAGE_VIEW, referrer_page: undefined });
    expect(telemetry.__queueForTests()[0].properties).not.toHaveProperty("referrer_page");
  });

  test("lib/telemetryEvents.generated.ts coincide con docs/telemetry/event-schemas.json", () => {
    const schema = JSON.parse(
      readFileSync(path.resolve(__dirname, "../../../docs/telemetry/event-schemas.json"), "utf8"),
    );
    expect(TELEMETRY_SCHEMA_VERSION).toBe(schema["x-schema-version"]);
    const fromJson = Object.fromEntries(
      Object.entries(schema.definitions)
        .filter(([name]) => name !== "envelope")
        .map(([name, def]) => {
          const props = (def as { allOf: { properties: { properties: { properties: object; required: string[] } } }[] })
            .allOf[1].properties.properties;
          return [name, { allowed: Object.keys(props.properties), required: props.required }];
        }),
    );
    expect(TELEMETRY_EVENT_KEYS).toEqual(fromJson);
  });
});

describe("cola y lotes", () => {
  test("no envía nada hasta 10 s; entonces manda la cola en un solo lote", () => {
    for (let i = 0; i < 3; i++) telemetry.track("page_viewed", PAGE_VIEW);
    expect(fetchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(telemetry.FLUSH_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(sentEvents()).toHaveLength(3);
  });

  test("al llegar a 20 eventos envía sin esperar", () => {
    for (let i = 0; i < telemetry.MAX_BATCH_SIZE; i++) telemetry.track("page_viewed", PAGE_VIEW);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentEvents()).toHaveLength(20);
    expect(telemetry.__queueForTests()).toHaveLength(0);
  });

  test("al ocultar la pestaña vacía la cola con sendBeacon (text/plain, sin preflight)", async () => {
    const beacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    telemetry.track("page_viewed", PAGE_VIEW);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(JSON.parse(text).events).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  test("los hooks previos al envío (Web Vitals) emiten antes del beacon", () => {
    const beacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    telemetry.onBeforeFlush(() => telemetry.track("page_viewed", PAGE_VIEW));
    telemetry.flushWithBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  test("sin NEXT_PUBLIC_TELEMETRY_ENDPOINT la telemetría está apagada", async () => {
    loadModules(undefined);
    jest.spyOn(console, "warn").mockImplementation(() => {});
    telemetry.track("page_viewed", PAGE_VIEW);
    await telemetry.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reintentos", () => {
  const noWait = () => Promise.resolve();

  test("reintenta hasta 3 veces con backoff exponencial y luego descarta", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const waits: number[] = [];
    const ok = await telemetry.sendBatch([], (ms) => {
      waits.push(ms);
      return Promise.resolve();
    });
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1 + telemetry.MAX_RETRIES);
    expect(waits).toEqual([1_000, 2_000, 4_000]);
  });

  test("si un reintento funciona, para ahí", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue(okResponse());
    expect(await telemetry.sendBatch([], noWait)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("un 5xx se reintenta; un 422 no (el lote no es válido)", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(okResponse(503)).mockResolvedValue(okResponse());
    expect(await telemetry.sendBatch([], noWait)).toBe(true);
    fetchMock.mockReset().mockResolvedValue(okResponse(422));
    expect(await telemetry.sendBatch([], noWait)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("eventos de inventario (obligatorios del BRIEFING)", () => {
  const entry = {
    id: 31,
    asset_id: 7,
    quantity: 10,
    supplier: "Imprenta Turia S.L.",
    office: "Valencia" as const,
    unit_cost: 12.5,
    currency: "EUR" as const,
    created_at: "2026-11-18T10:00:00Z",
    user_uuid: USER_ID,
    stock_after: 16,
    cost_baseline: null,
  };

  test("inbound_order_created con los campos mínimos del BRIEFING", () => {
    trackers.trackInboundCreated(ASSET, entry);
    const [event] = telemetry.__queueForTests();
    expect(event.event_type).toBe("inbound_order_created");
    expect(event.properties).toEqual({
      office: "valencia",
      product_id: "7",
      product_category: "training_kit",
      programme_id: "ventas-b2b",
      quantity: 10,
      currency: "EUR",
      order_id: "31",
      supplier_id: "imprenta-turia-s-l",
      unit_cost: 12.5,
      total_cost: 125,
      stock_after: 16,
    });
  });

  test("kit_cost_variance_detected solo si el coste se aleja más de un 10 % de la media", () => {
    trackers.trackInboundCreated(ASSET, { ...entry, cost_baseline: { unit_cost: 12, sample_size: 3 } });
    expect(telemetry.__queueForTests().map((e) => e.event_type)).toEqual(["inbound_order_created"]);

    trackers.trackInboundCreated(ASSET, { ...entry, unit_cost: 14, cost_baseline: { unit_cost: 12, sample_size: 3 } });
    const variance = telemetry.__queueForTests().find((e) => e.event_type === "kit_cost_variance_detected");
    expect(variance?.properties).toMatchObject({
      unit_cost: 14,
      baseline_unit_cost: 12,
      variance_pct: 16.7,
      threshold_pct: 10,
      baseline_sample_size: 3,
    });
  });

  const exit = {
    id: 40,
    asset_id: 7,
    quantity: 2,
    exit_type: "allocation" as const,
    assigned_to: "Lucía Ferrer",
    office: "Valencia" as const,
    recipient_type: "support_agent" as const,
    created_at: "2026-11-18T10:00:00Z",
    user_uuid: USER_ID,
  };

  test("outbound_order_created nunca lleva el nombre de quien recibe", () => {
    trackers.trackOutboundCreated(ASSET, { ...exit, stock_after: 10, min_stock: 5 });
    const [event] = telemetry.__queueForTests();
    expect(event.event_type).toBe("outbound_order_created");
    expect(event.properties.recipient_type).toBe("support_agent");
    expect(JSON.stringify(event)).not.toContain("Lucía");
  });

  test("stock_threshold_triggered solo al cruzar el mínimo", () => {
    trackers.trackOutboundCreated(ASSET, { ...exit, stock_after: 4, min_stock: 5 }); // 6 → 4: cruza
    trackers.trackOutboundCreated(ASSET, { ...exit, stock_after: 2, min_stock: 5 }); // 4 → 2: ya estaba debajo
    const thresholds = telemetry.__queueForTests().filter((e) => e.event_type === "stock_threshold_triggered");
    expect(thresholds).toHaveLength(1);
    expect(thresholds[0].properties).toMatchObject({ min_stock: 5, stock_before: 6, stock_after: 4, trigger_order_id: "40" });
  });

  test("stock_depleted cuando la salida deja el stock a 0", () => {
    trackers.trackOutboundCreated(ASSET, { ...exit, stock_after: 0, min_stock: 0 });
    expect(telemetry.__queueForTests().map((e) => e.event_type)).toContain("stock_depleted");
  });

  test("direct_stock_edit_rejected registra el intento, no el body", () => {
    trackers.trackDirectStockEditRejected({
      method: "PATCH",
      path: "/inventory/products/7",
      status: 405,
      body: { current_stock: 99 },
      asset: ASSET,
      userRole: "user",
    });
    const [event] = telemetry.__queueForTests();
    expect(event.event_type).toBe("direct_stock_edit_rejected");
    expect(event.properties).toEqual({
      office: "valencia",
      product_id: "7",
      product_category: "training_kit",
      programme_id: "ventas-b2b",
      currency: "EUR",
      quantity: 99,
      http_method: "PATCH",
      route: "/inventory/products/{id}",
      status_code: 405,
      rejected_fields: ["current_stock"],
      user_role: "user",
    });
  });

  test("rechazos de órdenes con su motivo normalizado", () => {
    trackers.trackOutboundRejected(ASSET, 9, "consumption", {
      status: 400,
      fieldErrors: {},
      detail: "Insufficient stock for asset 'Kit'. Available: 4, requested: 9.",
    });
    trackers.trackInboundRejected(ASSET, { status: 404, fieldErrors: {}, detail: "Activo 7 no encontrado" });
    trackers.trackInboundRejected(ASSET, { status: 500, fieldErrors: {}, detail: null }); // no es un rechazo
    const [outbound, inbound, ...rest] = telemetry.__queueForTests();
    expect(outbound.properties).toMatchObject({ error_code: "insufficient_stock", stock_available: 4, quantity: 9 });
    expect(inbound.properties).toMatchObject({ error_code: "asset_not_found", status_code: 404 });
    expect(rest).toHaveLength(0);
  });
});

describe("piso técnico", () => {
  test("rutas como plantilla, sin ids ni query", () => {
    expect(trackers.routeTemplate("/inventory/products/42?office=Valencia#x")).toBe("/inventory/products/{id}");
    expect(trackers.routeTemplate("/inventory/orders/inbound")).toBe("/inventory/orders/inbound");
  });

  test("los mensajes de error se sanean y se recortan", () => {
    const message = trackers.sanitizeErrorMessage(
      "Fallo para ana@nexova.com en /x?token=abc con id 12345678 " + "y".repeat(300),
    );
    expect(message).not.toContain("ana@nexova.com");
    expect(message).not.toContain("token=abc");
    expect(message).not.toContain("12345678");
    expect(message.length).toBeLessThanOrEqual(200);
  });

  test("frontend_error_captured: el mismo error una vez por minuto", () => {
    const error = new TypeError("x is undefined");
    trackers.trackFrontendError(error, "onerror", "/inventory/products");
    trackers.trackFrontendError(error, "onerror", "/inventory/products");
    expect(telemetry.__queueForTests()).toHaveLength(1);
    expect(telemetry.__queueForTests()[0].properties).toMatchObject({
      page: "/inventory/products",
      error_name: "TypeError",
      source: "onerror",
    });
    expect(telemetry.__queueForTests()[0].properties.fingerprint).toMatch(/^[0-9a-f]{12}$/);
  });

  test("login_failed: motivo deducido del status, nunca credenciales", () => {
    expect(trackers.loginFailureReason(401)).toBe("invalid_credentials");
    expect(trackers.loginFailureReason(429)).toBe("rate_limited");
    expect(trackers.loginFailureReason(0)).toBe("network_error");
    expect(trackers.loginFailureReason(503)).toBe("server_error");
  });

  test("api_request_failed: máximo uno por ruta cada 30 s", () => {
    const failure = { method: "GET", path: "/inventory/products", failureType: "network" as const, elapsedMs: 12 };
    trackers.trackApiRequestFailed(failure);
    trackers.trackApiRequestFailed(failure);
    expect(telemetry.__queueForTests()).toHaveLength(1);
    jest.advanceTimersByTime(trackers.REQUEST_FAILED_THROTTLE_MS); // también vacía la cola
    trackers.trackApiRequestFailed(failure);
    const sent = fetchMock.mock.calls.flatMap((call) => JSON.parse(call[1].body).events);
    expect([...sent, ...telemetry.__queueForTests()]).toHaveLength(2);
  });
});
