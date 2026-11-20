import { TelemetryReportView } from "@/components/telemetry/TelemetryReportView";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Telemetría técnica — Nexova Solutions",
};

export default function TelemetriaPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">Telemetría técnica</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Salud del sistema para el equipo de ingeniería: volumen de eventos, errores, carga de
        páginas y fallos de conexión y de login. No es un reporte de negocio.
      </p>
      <div className="mt-6">
        <TelemetryReportView />
      </div>
    </div>
  );
}
