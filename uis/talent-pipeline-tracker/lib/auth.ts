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

// Lee exp del payload sin verificar la firma: solo sirve para no mostrar el panel
// con un token caducado. La API es quien valida el token de verdad.
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const { exp } = JSON.parse(atob(padded));
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function isTokenValid(): boolean {
  const token = getToken();
  if (!token) return false;
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 > Date.now();
}
