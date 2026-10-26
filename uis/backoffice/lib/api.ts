// fetch contra services/api con el token de sesión.
import { clearToken, getToken } from "@/lib/auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LOGIN_PATH = "/auth/login";

// Igual que fetch (los fallos de red se propagan): añade Authorization si hay token
// y, ante un 401 fuera del login, cierra la sesión y vuelve a /login.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && path.split("?")[0] !== LOGIN_PATH) {
    clearToken();
    window.location.replace("/login");
  }
  return res;
}
