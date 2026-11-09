import type { Metadata } from "next";
import Link from "next/link";

import { EMPRESA } from "@/lib/nexova";

export const metadata: Metadata = {
  title: `Página no encontrada — ${EMPRESA.nombreCompleto}`,
};

export default function NotFound() {
  return (
    <main id="contenido" className="flex min-h-screen items-start justify-center px-4 py-16 sm:px-6">
      <section
        aria-labelledby="no-encontrada-titulo"
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6"
      >
        <h1 id="no-encontrada-titulo" className="text-2xl font-bold tracking-tight text-[#001D4A]">
          Página no encontrada
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          La dirección no existe o la página se ha movido.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500]"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
