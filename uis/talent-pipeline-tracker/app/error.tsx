'use client'; // Las fronteras de error de Next son Client Components

import Link from 'next/link';

// Fallo al renderizar una página. No se muestra el mensaje del error:
// en desarrollo podría incluir detalles internos.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-8">
      <div role="alert" className="max-w-xl">
        <h1 className="text-2xl font-bold mb-4">No se ha podido mostrar esta página</h1>
        <p className="text-red-600">Ha ocurrido un error inesperado. Puedes volver a intentarlo o ir al listado.</p>
        <div className="mt-4 flex gap-4 items-center">
          <button onClick={() => reset()} className="bg-blue-700 text-white px-4 py-2">
            Reintentar
          </button>
          <Link href="/" className="text-blue-700 hover:underline">Volver al inicio</Link>
        </div>
      </div>
    </main>
  );
}
