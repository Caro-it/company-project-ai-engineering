// Errores que ve el usuario: toApiError y errorMessage (lib/account.ts) y
// analyzerErrorMessage (lib/incidents.ts). Nunca se muestra el detail de la API.
import { GENERIC_ERROR, statusErrorMessage } from "@/lib/api";
import { ApiError, errorMessage, toApiError } from "@/lib/account";
import { AnalyzerError, analyzerErrorMessage } from "@/lib/incidents";

// jsdom no trae Response: basta con status y json(), que es lo que usa toApiError
function fakeResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  } as unknown as Response;
}

describe("toApiError", () => {
  test("un 422 de Pydantic guarda qué campos fallaron", async () => {
    const res = fakeResponse(422, {
      detail: [
        { loc: ["body", "password"], msg: "too short", type: "string_too_short" },
        { loc: ["body", "email"], msg: "not an email", type: "value_error" },
      ],
    });

    const error = await toApiError(res);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["email", "password"]);
    expect(error.message).toBe(statusErrorMessage(422));
  });

  test("en campos anidados el campo es el último nombre, sin índices ni 'body'", async () => {
    const res = fakeResponse(422, {
      detail: [{ loc: ["body", "categories", 0], msg: "invalid enum" }],
    });

    expect((await toApiError(res)).fieldErrors).toEqual({ categories: "invalid enum" });
  });

  test("si un campo falla dos veces se queda el primer error", async () => {
    const res = fakeResponse(422, {
      detail: [
        { loc: ["body", "password"], msg: "primero" },
        { loc: ["body", "password"], msg: "segundo" },
      ],
    });

    expect((await toApiError(res)).fieldErrors).toEqual({ password: "primero" });
  });

  test("un error sin campo (loc solo 'body') no inventa ninguno", async () => {
    const res = fakeResponse(422, { detail: [{ loc: ["body"], msg: "JSON inválido" }] });

    expect((await toApiError(res)).fieldErrors).toEqual({});
  });

  test("el detail de texto de la API no llega al mensaje", async () => {
    const res = fakeResponse(409, { detail: "Ya existe un usuario con el email ana@example.com" });

    const error = await toApiError(res);

    expect(error.message).toBe(statusErrorMessage(409));
    expect(error.message).not.toContain("ana@example.com");
    expect(error.fieldErrors).toEqual({});
  });

  test("una respuesta sin JSON se queda solo con el status", async () => {
    const res = fakeResponse(502, new SyntaxError("Unexpected token <"));

    const error = await toApiError(res);

    expect(error.status).toBe(502);
    expect(error.message).toBe(statusErrorMessage(502));
    expect(error.fieldErrors).toEqual({});
  });

  test("entradas de detail malformadas no rompen", async () => {
    const res = fakeResponse(422, { detail: [null, { msg: "sin loc" }, { loc: ["body", "name"] }] });

    // name aparece aunque no traiga msg; las entradas sin loc se ignoran
    expect((await toApiError(res)).fieldErrors).toEqual({ name: "" });
  });
});

describe("errorMessage", () => {
  test("de un ApiError devuelve su texto fijo", () => {
    expect(errorMessage(new ApiError(statusErrorMessage(403), 403))).toBe(statusErrorMessage(403));
  });

  test("de cualquier otro error devuelve el genérico, no su mensaje", () => {
    expect(errorMessage(new Error("stack interno con datos"))).toBe(GENERIC_ERROR);
    expect(errorMessage("texto suelto")).toBe(GENERIC_ERROR);
    expect(errorMessage(undefined)).toBe(GENERIC_ERROR);
  });
});

describe("analyzerErrorMessage", () => {
  test("los status del analizador tienen su texto propio", () => {
    expect(analyzerErrorMessage(new AnalyzerError(413))).toMatch(/50 MB/);
    expect(analyzerErrorMessage(new AnalyzerError(415))).toMatch(/\.csv/);
    expect(analyzerErrorMessage(new AnalyzerError(404))).toMatch(/Sube un CSV primero/);
  });

  test("un status sin texto propio cae en el texto general de ese status", () => {
    expect(analyzerErrorMessage(new AnalyzerError(500))).toBe(statusErrorMessage(500));
    expect(analyzerErrorMessage(new AnalyzerError(0))).toBe(statusErrorMessage(0));
  });

  test("la respuesta ilegible (status -1) da el genérico", () => {
    expect(analyzerErrorMessage(new AnalyzerError(-1))).toBe(GENERIC_ERROR);
  });

  test("errores que no son del analizador dan el genérico", () => {
    expect(analyzerErrorMessage(new Error("detalle interno"))).toBe(GENERIC_ERROR);
    expect(analyzerErrorMessage(new ApiError("otro texto", 400))).toBe(GENERIC_ERROR);
  });
});
