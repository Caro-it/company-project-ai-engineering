import { IncidentsDashboard } from "@/components/incidents/IncidentsDashboard";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Incidencias — Nexova Solutions",
};

export default function IncidenciasPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
            Incidencias
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Registro centralizado de los problemas técnicos y operativos de
            Nexova: fallos de sistemas, errores de proceso, quejas de clientes e
            incidencias del equipo. Cambia el estado de cada una a medida que
            avanza su gestión.
          </p>
        </div>
        <Link
          href="/incidencias/nueva"
          className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] focus:ring-2 focus:ring-[#001D4A] focus:outline-hidden"
        >
          + Registrar incidencia
        </Link>
      </div>
      <div className="mt-6">
        <IncidentsDashboard />
      </div>
    </div>
  );
}
