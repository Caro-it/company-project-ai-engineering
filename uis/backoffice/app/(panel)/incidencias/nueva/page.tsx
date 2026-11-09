import { IncidentForm } from "@/components/incidents/IncidentForm";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Registrar incidencia — Nexova Solutions",
};

export default function NuevaIncidenciaPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/incidencias"
        className="text-sm text-[#006992] underline underline-offset-2"
      >
        ← Volver al listado
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#001D4A]">
        Registrar incidencia
      </h1>
      <p className="mt-2 text-slate-600">
        Registra un problema técnico u operativo para que el equipo responsable
        pueda gestionarlo. Si la reporta una oficina, indica cuál.
      </p>
      <div className="mt-6">
        <IncidentForm />
      </div>
    </div>
  );
}
