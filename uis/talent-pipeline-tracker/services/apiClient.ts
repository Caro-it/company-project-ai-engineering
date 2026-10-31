// Cliente común de la API de 4Geeks (records y notes): errores tipados con status,
// timeout y parseo seguro. La UI traduce el status a textos fijos con errorMessage().

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Sin respuesta en este tiempo, la petición se aborta con un TimeoutError
const TIMEOUT_MS = 10_000;

// Status sintéticos para los fallos sin respuesta HTTP
export const NETWORK_ERROR_STATUS = 0;
export const TIMEOUT_STATUS = 408;
export const CONFIG_ERROR_STATUS = -1;
export const INVALID_RESPONSE_STATUS = -2;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(errorMessageForStatus(status));
    this.name = 'ApiError';
  }
}

const GENERIC_ERROR = 'No se ha podido completar la operación. Inténtalo de nuevo.';

// Texto fijo para cada status: nunca se muestra el cuerpo de la respuesta ni el número
function errorMessageForStatus(status: number): string {
  if (status === CONFIG_ERROR_STATUS) {
    return 'La aplicación no está configurada: falta NEXT_PUBLIC_API_URL en .env.local.';
  }
  if (status === INVALID_RESPONSE_STATUS) {
    return 'Respuesta inesperada del servidor. Inténtalo de nuevo.';
  }
  if (status === NETWORK_ERROR_STATUS) {
    return 'No se ha podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
  }
  if (status === TIMEOUT_STATUS) return 'El servidor tarda demasiado en responder. Inténtalo de nuevo.';
  if (status === 400 || status === 422) return 'Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.';
  if (status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
  if (status === 404) return 'No se ha encontrado lo que buscas.';
  if (status === 429) return 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.';
  if (status >= 500) return 'Ha ocurrido un error en el servidor. Inténtalo de nuevo en unos minutos.';
  return GENERIC_ERROR;
}

// Texto para mostrar de cualquier error capturado
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC_ERROR;
}

// fetch a la API: lanza ApiError ante falta de configuración, red caída, timeout o status no OK
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_URL) throw new ApiError(CONFIG_ERROR_STATUS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
    throw new ApiError(timedOut ? TIMEOUT_STATUS : NETWORK_ERROR_STATUS);
  }
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

// Cuerpo JSON de una respuesta correcta; si no es JSON, ApiError en vez de SyntaxError
export async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(INVALID_RESPONSE_STATUS);
  }
}
