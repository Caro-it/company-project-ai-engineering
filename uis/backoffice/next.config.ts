import path from "node:path";
import type { NextConfig } from "next";

// Raíz del monorepo: permite importar packages/shared por ruta relativa
// (Turbopack no resuelve archivos fuera de turbopack.root).
const monorepoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR solo lo usan los tests e2e (.next/e2e), para no pisar el build normal
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
