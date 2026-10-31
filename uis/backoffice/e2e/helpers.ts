import path from "node:path";

import type { Page, Route } from "@playwright/test";

import { WEB_URL } from "./ports.mjs";

export const SCREENSHOTS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "screenshots",
  "incident-manager",
);

// Respuestas simuladas de la API: llevan cabeceras CORS porque el backoffice y la API
// están en orígenes distintos (si no, el navegador las bloquearía como error de red).
const CORS_HEADERS = {
  "access-control-allow-origin": WEB_URL,
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};

type Method = "GET" | "POST" | "PATCH";

/**
 * Intercepta las peticiones `method` a una ruta exacta de la API (sin query) y deja pasar
 * el resto. `handler` decide la respuesta; el preflight OPTIONS se responde aquí.
 */
export async function mockApi(
  page: Page,
  pathname: string | RegExp,
  method: Method,
  handler: (route: Route) => Promise<void>,
) {
  await page.route(
    (url) =>
      typeof pathname === "string"
        ? url.pathname === pathname
        : pathname.test(url.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
      } else if (req.method() === method) {
        await handler(route);
      } else {
        await route.continue();
      }
    },
  );
}

export function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, json: body, headers: CORS_HEADERS });
}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
