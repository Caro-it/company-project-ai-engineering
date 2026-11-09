import { defineConfig, devices } from "@playwright/test";

import { API_URL, AUTH_STATE, WEB_PORT, WEB_URL } from "./e2e/ports.mjs";

// Tests e2e del gestor de incidencias. Arrancan su propia API (BD temporal con el seed)
// y su propio build del backoffice en .next/e2e: no usan la BD ni el build de desarrollo.
// Los specs comparten BD y se ejecutan en orden (01-, 02-…) con un solo worker.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node e2e/start-api.mjs",
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npx next start --port ${WEB_PORT}`,
      url: WEB_URL,
      env: { NEXT_PUBLIC_API_URL: API_URL, NEXT_DIST_DIR: ".next/e2e" },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
