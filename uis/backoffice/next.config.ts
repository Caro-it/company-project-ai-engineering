import path from "node:path";
import type { NextConfig } from "next";

// Raíz del monorepo: permite importar packages/shared por ruta relativa
// (Turbopack no resuelve archivos fuera de turbopack.root).
const monorepoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
};

export default nextConfig;
