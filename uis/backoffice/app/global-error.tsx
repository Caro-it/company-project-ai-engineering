"use client"; // Las fronteras de error de Next son Client Components

import Link from "next/link";

import "./globals.css";

// Sustituye al layout raíz cuando falla él mismo: necesita su propio <html> y <body>,
// y no hereda metadata (se usa <title>). No se muestra el mensaje del error.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-100 text-slate-800 antialiased">
        <title>Error — Backoffice Nexova</title>
        <main id="contenido" className="flex min-h-screen items-start justify-center px-4 py-16 sm:px-6">
          <div role="alert" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6">
            <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
              Algo ha fallado
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              El backoffice no se ha podido cargar. Inténtalo de nuevo; si el problema continúa,
              vuelve en unos minutos.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500]"
              >
                Reintentar
              </button>
              <Link
                href="/"
                className="rounded-md border border-[#001D4A] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-slate-50"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
