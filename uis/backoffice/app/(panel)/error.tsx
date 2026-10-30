"use client"; // Las fronteras de error de Next son Client Components

import Link from "next/link";

// Fallo al renderizar una página del panel. El mensaje del error no se muestra:
// en producción Next lo sustituye y en desarrollo podría incluir detalles internos.
export default function PanelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
          No se ha podido mostrar esta página
        </h1>
        <p className="mt-2 text-sm">
          Ha ocurrido un error inesperado. Puedes volver a intentarlo o ir al inicio del panel.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-rose-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-800"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-md border border-[#001D4A] px-3 py-1.5 text-sm font-medium text-[#001D4A] hover:bg-white"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
