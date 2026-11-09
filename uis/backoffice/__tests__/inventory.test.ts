// lib/inventory.ts: niveles de stock, parseo de formularios, errores de la API y
// cabecera Authorization en las llamadas a /inventory.
import { statusErrorMessage } from "@/lib/api";
import {
  InventoryError,
  LOW_STOCK_MAX,
  WARNING_STOCK_MAX,
  assetOptionLabel,
  createAssetExit,
  inventoryErrorMessage,
  listAssets,
  parseAssetId,
  parseQuantity,
  stockLevel,
  stockLevelLabel,
  toInventoryError,
} from "@/lib/inventory";

// jsdom no trae Response: basta con lo que usan apiFetch y toInventoryError
function fakeResponse(status: number, body: unknown): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
    clone: () => fakeResponse(status, body),
  };
  return res as unknown as Response;
}

describe("stockLevel y stockLevelLabel", () => {
  test.each([
    [0, "low", "Agotado"],
    [1, "low", "Stock bajo"],
    [LOW_STOCK_MAX, "low", "Stock bajo"],
    [LOW_STOCK_MAX + 1, "warning", "Stock justo"],
    [WARNING_STOCK_MAX, "warning", "Stock justo"],
    [WARNING_STOCK_MAX + 1, "ok", "Stock correcto"],
  ])("stock %i → %s («%s»)", (stock, level, label) => {
    expect(stockLevel(stock)).toBe(level);
    expect(stockLevelLabel(stock)).toBe(label);
  });

  test("los niveles del seed del BRIEFING", () => {
    // NXV-IT-001 12, NXV-PER-001 0, NXV-PER-002 4, NXV-OFF-001 16
    expect([12, 0, 4, 16].map(stockLevel)).toEqual(["warning", "low", "low", "ok"]);
  });
});

describe("parseQuantity", () => {
  test.each([
    ["1", 1],
    ["12", 12],
    [" 7 ", 7],
  ])("«%s» es %i", (value, expected) => {
    expect(parseQuantity(value)).toBe(expected);
  });

  test.each(["", "0", "-3", "2.5", "1e3", "abc"])("«%s» no es una cantidad válida", (value) => {
    expect(parseQuantity(value)).toBeNull();
  });
});

describe("parseAssetId", () => {
  test("acepta un entero positivo de la query", () => {
    expect(parseAssetId("3")).toBe(3);
  });

  test.each([null, "", "0", "-1", "abc", "1.5"])("%p no es un id", (value) => {
    expect(parseAssetId(value)).toBeNull();
  });
});

test("assetOptionLabel distingue activos con el mismo nombre por SKU y oficina", () => {
  const valencia = { name: 'Portátil 14" Business', sku: "NXV-IT-001", office: "Valencia" as const };
  const miami = { name: 'Portátil 14" Business', sku: "NXV-IT-002", office: "Miami" as const };
  expect(assetOptionLabel(valencia)).toBe('Portátil 14" Business · NXV-IT-001 · Valencia');
  expect(assetOptionLabel(valencia)).not.toBe(assetOptionLabel(miami));
});

describe("toInventoryError", () => {
  test("el 400 de stock insuficiente conserva el mensaje literal de la API", async () => {
    const detail = "Insufficient stock for asset 'Hub USB-C'. Available: 4, requested: 9.";
    const error = await toInventoryError(fakeResponse(400, { detail }));

    expect(error).toBeInstanceOf(InventoryError);
    expect(error.status).toBe(400);
    expect(error.message).toBe(detail);
    expect(error.isInsufficientStock).toBe(true);
  });

  test("otro 400 de negocio muestra su detail pero no es de stock", async () => {
    const detail = "El activo 'Hub USB-C' (NXV-PER-002) pertenece a la oficina Miami, no a Valencia.";
    const error = await toInventoryError(fakeResponse(400, { detail }));

    expect(error.message).toBe(detail);
    expect(error.isInsufficientStock).toBe(false);
  });

  test("un 422 de Pydantic dice qué campos revisar, con etiquetas en español", async () => {
    const error = await toInventoryError(
      fakeResponse(422, {
        detail: [
          { loc: ["body", "quantity"], msg: "Input should be greater than 0" },
          { loc: ["body", "assigned_to"], msg: "String should have at least 1 character" },
        ],
      }),
    );

    expect(error.status).toBe(422);
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["assigned_to", "quantity"]);
    expect(error.message).toBe("Revisa estos campos: Cantidad, Asignado a.");
    expect(error.message).not.toMatch(/Input should/);
  });

  test("un 422 del model_validator (sin campo) explica la regla de «Asignado a»", async () => {
    const error = await toInventoryError(
      fakeResponse(422, {
        detail: [{ loc: ["body"], msg: 'Value error, assigned_to es obligatorio cuando exit_type es "allocation"' }],
      }),
    );

    expect(error.fieldErrors).toEqual({});
    expect(error.message).toMatch(/Asignado a/);
    expect(error.message).not.toMatch(/Value error/);
  });

  test("un 404 con detail muestra el detail de la API", async () => {
    const detail = "Asset 99 not found";
    const error = await toInventoryError(fakeResponse(404, { detail }));

    expect(error.status).toBe(404);
    expect(error.message).toBe(detail);
    expect(error.isInsufficientStock).toBe(false);
  });

  test("un 409 con detail muestra el detail de la API", async () => {
    const detail = "An asset with SKU 'NXV-IT-001' already exists.";
    const error = await toInventoryError(fakeResponse(409, { detail }));

    expect(error.status).toBe(409);
    expect(error.message).toBe(detail);
  });

  test("un 500 con detail usa el texto fijo, nunca el detail", async () => {
    const error = await toInventoryError(
      fakeResponse(500, { detail: "sqlalchemy.exc.OperationalError: connection refused" }),
    );

    expect(error.message).toBe(statusErrorMessage(500));
    expect(error.message).not.toMatch(/sqlalchemy/);
  });

  test("un 401 con detail usa el texto fijo de sesión caducada", async () => {
    const error = await toInventoryError(fakeResponse(401, { detail: "Could not validate credentials" }));

    expect(error.message).toBe(statusErrorMessage(401));
  });

  test("un 404 sin JSON cae en el texto fijo", async () => {
    const error = await toInventoryError(fakeResponse(404, new SyntaxError("Unexpected token <")));

    expect(error.status).toBe(404);
    expect(error.message).toBe(statusErrorMessage(404));
  });

  test.each([
    ["vacío", ""],
    ["solo espacios", "   "],
    ["no es texto", { reason: "x" }],
  ])("un 409 con detail %s cae en el texto fijo", async (_case, detail) => {
    const error = await toInventoryError(fakeResponse(409, { detail }));

    expect(error.message).toBe(statusErrorMessage(409));
  });

  test("un 400 sin JSON cae en el texto fijo", async () => {
    const error = await toInventoryError(fakeResponse(400, new SyntaxError("Unexpected token <")));

    expect(error.message).toBe(statusErrorMessage(400));
  });
});

test("inventoryErrorMessage no muestra errores que no vienen de la API", () => {
  expect(inventoryErrorMessage(new InventoryError("Texto visible", 400))).toBe("Texto visible");
  expect(inventoryErrorMessage(new Error("stack interno"))).not.toMatch(/stack interno/);
});

describe("peticiones a /inventory", () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    // jsdom no trae AbortSignal.timeout ni AbortSignal.any en todas las versiones
    if (!("timeout" in AbortSignal)) {
      Object.assign(AbortSignal, { timeout: () => new AbortController().signal });
    }
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    window.localStorage.setItem("nexova_token", "token.de.prueba");
  });

  afterEach(() => window.localStorage.clear());

  test("listAssets llama a /inventory/products con Authorization: Bearer", async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, []));

    await expect(listAssets()).resolves.toEqual([]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/inventory/products");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token.de.prueba");
  });

  test("createAssetExit envía el body en JSON y propaga el 400 de stock", async () => {
    const detail = "Insufficient stock for asset 'Hub USB-C'. Available: 4, requested: 9.";
    fetchMock.mockResolvedValue(fakeResponse(400, { detail }));

    const call = createAssetExit({
      asset_id: 4,
      quantity: 9,
      exit_type: "consumption",
      assigned_to: null,
      office: "Miami",
    });

    await expect(call).rejects.toMatchObject({ status: 400, message: detail });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/inventory/orders/outbound");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      asset_id: 4,
      quantity: 9,
      exit_type: "consumption",
      assigned_to: null,
      office: "Miami",
    });
  });

  test("un fallo de red acaba en un InventoryError con texto comprensible", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(listAssets()).rejects.toMatchObject({ status: 0, message: statusErrorMessage(0) });
  });
});
