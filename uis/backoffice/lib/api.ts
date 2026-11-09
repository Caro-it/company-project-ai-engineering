// fetch contra services/api con el token de sesión.
import { clearToken, getToken } from "@/lib/auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LOGIN_PATH = "/auth/login";

// Sin respuesta en este tiempo, la petición se aborta con un TimeoutError
const TIMEOUT_MS = 15_000;

// Status sintéticos para los fallos sin respuesta HTTP
export const NETWORK_ERROR_STATUS = 0;
export const TIMEOUT_STATUS = 408;

// Igual que fetch (los fallos de red y el timeout se propagan): añade Authorization si hay
// token y, ante un 401 fuera del login, cierra la sesión y vuelve a /login.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal });

  if (res.status === 401 && path.split("?")[0] !== LOGIN_PATH) {
    clearToken();
    window.location.replace("/login");
  }
  return res;
}

// Status sintético de un fallo de fetch: timeout o sin conexión
export function failedRequestStatus(e: unknown): number {
  return e instanceof DOMException && e.name === "TimeoutError"
    ? TIMEOUT_STATUS
    : NETWORK_ERROR_STATUS;
}

export const GENERIC_ERROR =
  "No se ha podido completar la operación. Inténtalo de nuevo.";

// Texto fijo para cada status: nunca se muestra el detail de la API ni el número de status
export function statusErrorMessage(status: number): string {
  if (status === NETWORK_ERROR_STATUS) {
    return "No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
  }
  if (status === TIMEOUT_STATUS) {
    return "El servidor tarda demasiado en responder. Inténtalo de nuevo.";
  }
  if (status === 400 || status === 422) {
    return "Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.";
  }
  if (status === 401) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
  if (status === 403) return "No tienes permiso para realizar esta acción.";
  if (status === 404) return "No se ha encontrado lo que buscas.";
  if (status === 429) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (status >= 500) {
    return "Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.";
  }
  return GENERIC_ERROR;
}
