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
  // Las rutas del inventario son /inventory/... (como el resto de secciones, sin prefijo,
  // porque la app ya es el backoffice). Las URLs del README del Hito 5 llevan /backoffice
  // delante: se redirigen (308) conservando la query, p. ej. ?asset_id=3.
  async redirects() {
    return [
      {
        source: "/backoffice/inventory/:path*",
        destination: "/inventory/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
