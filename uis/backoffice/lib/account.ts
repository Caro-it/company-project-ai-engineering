// Cliente de autenticación, usuarios y perfil de la API
// (services/api/app/routers/auth.py, users.py y profiles.py), incluidas las contraseñas.
import { apiFetch } from "@/lib/api";

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

const NETWORK_ERROR =
  "No se pudo conectar con la API. ¿Está arrancada en el puerto 8000?";

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Error ${res.status} al procesar la petición.`;
  const fieldErrors: Record<string, string> = {};
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
    if (Array.isArray(data?.detail)) {
      for (const e of data.detail as { loc?: (string | number)[]; msg?: string }[]) {
        const field = e.loc?.filter((p) => p !== "body").at(-1);
        if (field !== undefined && e.msg && !(field in fieldErrors)) {
          fieldErrors[String(field)] = e.msg;
        }
      }
      message = "Revisa los campos marcados.";
    }
  } catch {
    // respuesta sin JSON: usamos el mensaje genérico
  }
  return new ApiError(message, res.status, fieldErrors);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// El login es OAuth2 password flow: form-urlencoded con username = email
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username: email, password });
  const data = await request<{ access_token: string; token_type: string }>(
    "/auth/login",
    { method: "POST", body },
  );
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
  return data.message;
}

// 400 si el token no existe, ha caducado o ya se usó
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const data = await request<MessageResponse>("/auth/reset-password", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return data.message;
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
  return data.message;
}
