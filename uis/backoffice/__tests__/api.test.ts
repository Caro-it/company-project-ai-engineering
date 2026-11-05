// lib/api.ts: status sintético de los fallos de fetch y texto fijo para cada status.
import {
  GENERIC_ERROR,
  NETWORK_ERROR_STATUS,
  TIMEOUT_STATUS,
  failedRequestStatus,
  statusErrorMessage,
} from "@/lib/api";

describe("failedRequestStatus", () => {
  test("un timeout de AbortSignal.timeout es 408", () => {
    expect(failedRequestStatus(new DOMException("tarda", "TimeoutError"))).toBe(TIMEOUT_STATUS);
  });

  test("un fallo de red (TypeError de fetch) es 0", () => {
    expect(failedRequestStatus(new TypeError("Failed to fetch"))).toBe(NETWORK_ERROR_STATUS);
  });

  test("un DOMException que no es timeout no se confunde con un timeout", () => {
    expect(failedRequestStatus(new DOMException("cancelada", "AbortError"))).toBe(
      NETWORK_ERROR_STATUS,
    );
  });

  test.each([
    ["un objeto con name TimeoutError", { name: "TimeoutError" }],
    ["un string", "TimeoutError"],
    ["undefined", undefined],
  ])("%s no es un timeout", (_caso, value) => {
    // Solo un DOMException real cuenta como timeout
    expect(failedRequestStatus(value)).toBe(NETWORK_ERROR_STATUS);
  });
});

describe("statusErrorMessage", () => {
  test("cada fallo sin respuesta tiene su propio texto", () => {
    const network = statusErrorMessage(NETWORK_ERROR_STATUS);
    const timeout = statusErrorMessage(TIMEOUT_STATUS);
    expect(network).toMatch(/conectar con el servidor/);
    expect(timeout).toMatch(/tarda demasiado/);
    expect(network).not.toBe(timeout);
  });

  test("400 y 422 comparten el texto de datos no válidos", () => {
    expect(statusErrorMessage(400)).toBe(statusErrorMessage(422));
    expect(statusErrorMessage(400)).toMatch(/datos enviados no son válidos/);
  });

  test("401, 403, 404 y 429 tienen textos distintos entre sí", () => {
    const texts = [401, 403, 404, 429].map(statusErrorMessage);
    expect(new Set(texts).size).toBe(4);
    expect(statusErrorMessage(401)).toMatch(/sesión ha caducado/);
    expect(statusErrorMessage(403)).toMatch(/permiso/);
  });

  test.each([500, 502, 503, 599])("todo 5xx (%i) es error del servidor", (status) => {
    expect(statusErrorMessage(status)).toBe(statusErrorMessage(500));
    expect(statusErrorMessage(status)).toMatch(/error en el servidor/);
  });

  test.each([405, 409, 418, -1])("un status sin texto propio (%i) da el genérico", (status) => {
    expect(statusErrorMessage(status)).toBe(GENERIC_ERROR);
  });

  test("nunca incluye el número de status", () => {
    for (const status of [0, 400, 401, 403, 404, 408, 409, 422, 429, 500, 503]) {
      expect(statusErrorMessage(status)).not.toContain(String(status));
    }
  });
});
