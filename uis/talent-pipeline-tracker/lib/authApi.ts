// Cliente de autenticación contra la API de Nexova (services/api/app/routers/auth.py).
// Las llamadas a la API de 4Geeks (services/records.ts y services/notes.ts) no llevan este token.
import { clearToken, getToken } from "@/lib/auth";

export const AUTH_API_URL =
  process.env.NEXT_PUBLIC_AUTH_API_URL ?? "http://localhost:8000";

export interface Me {
  email: string;
  role: "admin" | "manager" | "user";
  profile: {
    name: string | null;
    phone: string | null;
    address: string | null;
  } | null;
}

// Error de la API de Nexova con su status (0 = sin conexión), para que la UI
// distinga un 401 de un fallo de red o del servidor. message es siempre un texto fijo.
export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

const NETWORK_ERROR =
  "No se pudo conectar con el servidor. Inténtalo de nuevo en unos minutos.";
const INVALID_RESPONSE = "Respuesta inesperada del servidor. Inténtalo de nuevo.";

function statusText(status: number): string {
  if (status === 429) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (status >= 500) return "Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.";
  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new AuthApiError(INVALID_RESPONSE, res.status);
  }
}

// El login es OAuth2 password flow: form-urlencoded con username = email
export async function login(email: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_API_URL}/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ username: email, password }),
    });
  } catch {
    throw new AuthApiError(NETWORK_ERROR, 0);
  }
  // Mensaje genérico: no se distingue si falla el email o la contraseña
  if (res.status === 401) throw new AuthApiError("Email o contraseña incorrectos.", 401);
  if (!res.ok) throw new AuthApiError(statusText(res.status), res.status);
  const data = await readJson<{ access_token?: unknown } | null>(res);
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new AuthApiError(INVALID_RESPONSE, res.status);
  }
  return data.access_token;
}

// Con un 401 (token caducado, manipulado o de un usuario desactivado) se cierra la sesión
export async function getMe(): Promise<Me> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
  } catch {
    throw new AuthApiError(NETWORK_ERROR, 0);
  }
  if (res.status === 401) {
    clearToken();
    window.location.replace("/login");
    throw new AuthApiError("La sesión no es válida.", 401);
  }
  if (!res.ok) throw new AuthApiError(statusText(res.status), res.status);
  return readJson<Me>(res);
}
