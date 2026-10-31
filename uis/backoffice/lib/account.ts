// Cliente de autenticación, usuarios y perfil de la API
// (services/api/app/routers/auth.py, users.py y profiles.py), incluidas las contraseñas.
import {
  GENERIC_ERROR,
  apiFetch,
  failedRequestStatus,
  statusErrorMessage,
} from "@/lib/api";

export interface ProfileData {
  name: string | null;
  phone: string | null;
  address: string | null;
}

export interface Me {
  email: string;
  role: "admin" | "manager" | "user";
  profile: ProfileData | null;
}

export interface RegisterData extends Partial<ProfileData> {
  email: string;
  password: string;
}

// Error de la API con los errores por campo de un 422 (clave = último elemento de loc)
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

// message es siempre un texto fijo según el status (statusErrorMessage): nunca el detail
// de la API. fieldErrors guarda el msg de Pydantic solo para saber qué campos fallaron;
// la UI muestra sus propios textos por campo.
export async function toApiError(res: Response): Promise<ApiError> {
  const fieldErrors: Record<string, string> = {};
  try {
    const data = await res.json();
    if (Array.isArray(data?.detail)) {
      for (const e of data.detail as { loc?: (string | number)[]; msg?: string }[]) {
        const field = e?.loc?.filter((p) => typeof p === "string" && p !== "body").at(-1);
        if (field !== undefined && !(field in fieldErrors)) {
          fieldErrors[String(field)] = e?.msg ?? "";
        }
      }
    }
  } catch {
    // respuesta sin JSON: basta con el status
  }
  return new ApiError(statusErrorMessage(res.status), res.status, fieldErrors);
}

// Petición con errores tipados: fallo de red o timeout (status 0/408), status no OK
// y cuerpo que no es JSON acaban siempre en un ApiError con texto fijo.
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    const status = failedRequestStatus(e);
    throw new ApiError(statusErrorMessage(status), status);
  }
  if (!res.ok) throw await toApiError(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("Respuesta inesperada del servidor. Inténtalo de nuevo.", res.status);
  }
}

// Texto para mostrar de cualquier error capturado
export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC_ERROR;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// El login es OAuth2 password flow: form-urlencoded con username = email
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const data = await request<{ access_token: string; token_type: string }>(
    "/auth/login",
    { method: "POST", body },
  );
  if (typeof data?.access_token !== "string" || !data.access_token) {
    throw new ApiError("Respuesta inesperada del servidor. Inténtalo de nuevo.", 200);
  }
  return data.access_token;
}

export function registerUser(data: RegisterData): Promise<unknown> {
  return request("/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function getMe(): Promise<Me> {
  return request<Me>("/auth/me");
}

export function updateMyProfile(data: ProfileData): Promise<ProfileData> {
  return request<ProfileData>("/profiles/me", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

// --- Contraseñas (AUTH-03): las respuestas son { message } ---

interface MessageResponse {
  message: string;
}

// Siempre 200 con el mismo mensaje, exista o no el email
export async function forgotPassword(email: string): Promise<string> {
  const data = await request<MessageResponse>("/auth/forgot-password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ email }),
  });
  return data?.message ?? "Si esa dirección está registrada, recibirás un enlace en breve";
}

// 400 si el token no existe, ha caducado o ya se usó
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const data = await request<MessageResponse>("/auth/reset-password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return data?.message ?? "Contraseña actualizada.";
}

// Con el token de sesión (apiFetch). 400 si la contraseña actual no es correcta
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const data = await request<MessageResponse>("/auth/change-password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  return data?.message ?? "Contraseña cambiada correctamente.";
}
