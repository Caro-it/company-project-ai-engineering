// Arranca services/api para los tests e2e con una BD temporal propia.
// Nunca usa services/api/data/: NEXOVA_DATA_DIR apunta a una carpeta del sistema que
// se borra en cada ejecución y se rellena con el seed (96 incidencias).
// Nunca usa Supabase: DATABASE_URL apunta a un SQLite de esa misma carpeta (las variables
// del proceso tienen prioridad sobre services/api/.env) y se siembra con seed-inventory.
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
  DATABASE_URL: `sqlite:///${path.join(dataDir, "e2e-inventory.db").split(path.sep).join("/")}`,
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

// seed-inventory firma las órdenes con el user_uuid del primer admin activo de TinyDB.
// Se crea con create_user (create-admin pide la contraseña con getpass, que no lee de un pipe).
const admin = spawnSync(
  "uv",
  [
    "run",
    "python",
    "-c",
    [
      "from app.auth_models import Role, UserCreate",
      "from app.services.users import create_user",
      "create_user(UserCreate(email='e2e-admin@example.com', password='Password123'), role=Role.ADMIN)",
    ].join("; "),
  ],
  { cwd: apiDir, env, stdio: "inherit" },
);
if (admin.status !== 0) {
  console.error("No se ha podido crear el admin de la BD de test.");
  process.exit(admin.status ?? 1);
}

// Inventario (Hito 5): 6 activos, 5 entradas y 3 salidas del BRIEFING
const seedInventory = spawnSync("uv", ["run", "seed-inventory"], {
  cwd: apiDir,
  env,
  stdio: "inherit",
});
if (seedInventory.status !== 0) {
  console.error("No se ha podido sembrar el inventario de la BD de test.");
  process.exit(seedInventory.status ?? 1);
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
