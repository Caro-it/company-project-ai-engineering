import { WeeklyPerformanceDashboard } from "@/components/reporting/WeeklyPerformanceDashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reporte semanal por oficina y programa — Nexova Solutions",
};

export default function ReportingPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Reporte Semanal de Desempeño por Oficina y Programa
      </h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Inversión y entrega del material de formación e incorporación de Valencia y Miami, por
        programa. Se actualiza cada lunes por la mañana con la semana anterior.
      </p>
      <div className="mt-6">
        <WeeklyPerformanceDashboard />
      </div>
    </div>
  );
}
