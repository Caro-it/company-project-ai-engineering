import type { NextConfig } from "next";
import path from "node:path";

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
  // Next 16 en modo dev bloquea sus recursos (/_next/*) si el navegador no abre desde localhost.
  // En el VPS: ALLOWED_DEV_ORIGINS=<IP_VPS> en el .env (lista separada por comas).
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

export default nextConfig;
