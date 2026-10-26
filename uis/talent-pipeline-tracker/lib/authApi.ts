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

const NETWORK_ERROR =
  "No se pudo conectar con la API de Nexova. ¿Está arrancada en el puerto 8000?";

// El login es OAuth2 password flow: form-urlencoded con username = email
export async function login(email: string, password: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_API_URL}/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ username: email, password }),
    });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  // Mensaje genérico: no se distingue si falla el email o la contraseña
  if (res.status === 401) throw new Error("Email o contraseña incorrectos.");
  if (!res.ok) throw new Error(`Error ${res.status} al iniciar sesión.`);
  const data: { access_token: string } = await res.json();
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
    throw new Error(NETWORK_ERROR);
  }
  if (res.status === 401) {
    clearToken();
    window.location.replace("/login");
    throw new Error("La sesión no es válida.");
  }
  if (!res.ok) throw new Error(`Error ${res.status} al comprobar la sesión.`);
  return res.json() as Promise<Me>;
}
