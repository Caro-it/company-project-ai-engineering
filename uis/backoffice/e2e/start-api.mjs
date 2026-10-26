// Arranca services/api para los tests e2e con una BD temporal propia.
// Nunca usa services/api/data/: NEXOVA_DATA_DIR apunta a una carpeta del sistema que
// se borra en cada ejecución y se rellena con el seed (96 incidencias).
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_PORT, WEB_URL } from "./ports.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const apiDir = path.join(repoRoot, "services", "api");
const dataDir = path.join(tmpdir(), "nexova-backoffice-e2e");

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  NEXOVA_DATA_DIR: dataDir,
  SECRET_KEY: "e2e-secret-key-solo-para-tests",
  CORS_ORIGINS: JSON.stringify([WEB_URL]),
  RESEND_API_KEY: "",
};

// uv run usa el entorno de services/api (lo crea si no existe)
const seed = spawnSync(
  "uv",
  ["run", "python", path.join(repoRoot, "scripts", "seed_incidents.py")],
  { cwd: apiDir, env, stdio: "inherit" },
);
if (seed.status !== 0) {
  console.error("No se ha podido ejecutar el seed de la BD de test.");
  process.exit(seed.status ?? 1);
}

const api = spawn(
  "uv",
  ["run", "python", "-m", "uvicorn", "app.main:app", "--port", String(API_PORT)],
  { cwd: apiDir, env, stdio: "inherit" },
);
api.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => api.kill(signal));
}
