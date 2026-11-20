// Token JWT de la API (services/api) guardado en localStorage.
// localStorage puede no existir (servidor) o lanzar (modo privado, almacenamiento bloqueado).

const TOKEN_KEY = "nexova_token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // sin almacenamiento la sesión no persiste, pero la app sigue funcionando
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nada que borrar
  }
}

// Payload del JWT sin verificar la firma: solo para la interfaz y la telemetría.
// La API es quien valida el token de verdad.
function tokenPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const data = JSON.parse(atob(padded));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

// Sirve para no mostrar el panel con un token caducado
function tokenExpiry(token: string): number | null {
  const exp = tokenPayload(token)?.exp;
  return typeof exp === "number" ? exp : null;
}

// Id del usuario de la sesión (claim sub del token = users.id de la API) o null
export function tokenSubject(): string | null {
  const token = getToken();
  if (!token) return null;
  const sub = tokenPayload(token)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 > Date.now();
}
