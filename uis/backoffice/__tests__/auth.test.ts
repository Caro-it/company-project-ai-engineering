// lib/auth.ts: token de sesión en localStorage y comprobación local de su caducidad.
import { clearToken, getToken, isTokenValid, setToken } from "@/lib/auth";

const TOKEN_KEY = "nexova_token";
// Reloj fijo: 2026-01-01T00:00:00Z
const NOW_MS = Date.UTC(2026, 0, 1);
const NOW_S = NOW_MS / 1000;

function base64url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// JWT sin firma real: isTokenValid no la comprueba (la valida la API)
function jwtWith(payload: unknown): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  return `${header}.${base64url(JSON.stringify(payload))}.firma`;
}

function storageThrows(method: "getItem" | "setItem" | "removeItem") {
  return jest.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new DOMException("Almacenamiento bloqueado", "SecurityError");
  });
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
});

afterEach(() => {
  jest.restoreAllMocks();
  window.localStorage.clear();
});

describe("getToken", () => {
  test("devuelve el token guardado", () => {
    window.localStorage.setItem(TOKEN_KEY, "abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
  });

  test("devuelve null si no hay sesión", () => {
    expect(getToken()).toBeNull();
  });

  test("devuelve null si localStorage lanza", () => {
    window.localStorage.setItem(TOKEN_KEY, "abc.def.ghi");
    storageThrows("getItem");
    expect(getToken()).toBeNull();
  });
});

describe("setToken", () => {
  test("guarda el token en la clave de sesión", () => {
    setToken("nuevo.token.jwt");
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe("nuevo.token.jwt");
    expect(getToken()).toBe("nuevo.token.jwt");
  });

  test("no rompe si localStorage lanza, y no queda sesión guardada", () => {
    storageThrows("setItem");
    expect(() => setToken("nuevo.token.jwt")).not.toThrow();
    jest.restoreAllMocks();
    expect(getToken()).toBeNull();
  });
});

describe("clearToken", () => {
  test("borra el token: ya no hay sesión", () => {
    setToken(jwtWith({ exp: NOW_S + 60 }));
    clearToken();
    expect(getToken()).toBeNull();
    expect(isTokenValid()).toBe(false);
  });

  test("no rompe si localStorage lanza", () => {
    setToken("abc.def.ghi");
    storageThrows("removeItem");
    expect(() => clearToken()).not.toThrow();
  });
});

describe("isTokenValid", () => {
  test("token con exp futuro es válido", () => {
    setToken(jwtWith({ sub: "u1", exp: NOW_S + 60 }));
    expect(isTokenValid()).toBe(true);
  });

  test("token con exp pasado no es válido", () => {
    setToken(jwtWith({ sub: "u1", exp: NOW_S - 1 }));
    expect(isTokenValid()).toBe(false);
  });

  test("token que caduca justo ahora ya no es válido", () => {
    // La comparación es estricta (exp * 1000 > Date.now())
    setToken(jwtWith({ sub: "u1", exp: NOW_S }));
    expect(isTokenValid()).toBe(false);
  });

  test("depende del reloj: el mismo token deja de valer cuando pasa exp", () => {
    setToken(jwtWith({ sub: "u1", exp: NOW_S + 60 }));
    expect(isTokenValid()).toBe(true);
    jest.spyOn(Date, "now").mockReturnValue(NOW_MS + 61_000);
    expect(isTokenValid()).toBe(false);
  });

  test("sin token no es válido", () => {
    expect(isTokenValid()).toBe(false);
  });

  test("con localStorage que lanza no es válido", () => {
    setToken(jwtWith({ sub: "u1", exp: NOW_S + 60 }));
    storageThrows("getItem");
    expect(isTokenValid()).toBe(false);
  });

  test.each([
    ["sin puntos", "abc"],
    ["payload vacío", "cabecera..firma"],
    ["payload que no es base64", "cabecera.%%%.firma"],
    ["payload que no es JSON", `cabecera.${base64url("esto no es json")}.firma`],
  ])("token malformado (%s) no es válido", (_caso, token) => {
    setToken(token);
    expect(isTokenValid()).toBe(false);
  });

  test("payload sin exp no es válido", () => {
    setToken(jwtWith({ sub: "u1" }));
    expect(isTokenValid()).toBe(false);
  });

  test("exp que no es un número no es válido", () => {
    // Un string con una fecha futura tampoco cuenta: exp debe ser numérico
    setToken(jwtWith({ sub: "u1", exp: String(NOW_S + 60) }));
    expect(isTokenValid()).toBe(false);
  });

  test("decodifica payloads base64url con '-' y '_'", () => {
    // "?" y ">" producen "/" y "+" en base64, que en base64url son "_" y "-"
    const token = jwtWith({ sub: "???>>>", exp: NOW_S + 60 });
    expect(token.split(".")[1]).toMatch(/[-_]/);
    setToken(token);
    expect(isTokenValid()).toBe(true);
  });
});
