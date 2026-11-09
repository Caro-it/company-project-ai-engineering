// Puertos de los tests e2e: distintos de los de desarrollo (API 8000, backoffice 3001)
// para no chocar con los servidores que puedas tener arrancados.
export const API_PORT = 8100;
export const WEB_PORT = 3100;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

// Sesión del usuario de test (la guarda auth.setup.ts; ignorada por git)
export const AUTH_STATE = "e2e/.auth/user.json";
