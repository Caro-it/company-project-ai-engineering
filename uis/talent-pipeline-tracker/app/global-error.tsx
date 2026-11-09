'use client'; // Las fronteras de error de Next son Client Components

import Link from 'next/link';

import './globals.css';

// Sustituye al layout raíz cuando falla él mismo: necesita su propio <html> y <body>,
// y no hereda metadata (se usa <title>). No se muestra el mensaje del error.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <title>Error — Talent Pipeline Tracker</title>
        <main className="p-8">
          <div role="alert" className="max-w-xl">
            <h1 className="text-2xl font-bold mb-4">Algo ha fallado</h1>
            <p className="text-red-600">
              La aplicación no se ha podido cargar. Inténtalo de nuevo; si el problema continúa, vuelve en unos minutos.
            </p>
            <div className="mt-4 flex gap-4 items-center">
              <button onClick={() => reset()} className="bg-blue-700 text-white px-4 py-2">
                Reintentar
              </button>
              <Link href="/" className="text-blue-700 hover:underline">Volver al inicio</Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
