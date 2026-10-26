import { IncidentsAnalyzer } from "@/components/IncidentsAnalyzer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Análisis de incidencias — Nexova Solutions",
};

export default function AnalizadorPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Análisis de incidencias
      </h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Sube el CSV exportado del helpdesk para validar los registros y ver el
        resumen de tickets por categoría, estado y satisfacción. El análisis se
        hace en los servidores de Nexova y no se muestra ningún dato personal de
        clientes.
      </p>
      <div className="mt-6">
        <IncidentsAnalyzer />
      </div>
    </div>
  );
}
