// Cliente de los endpoints de reporting de negocio (services/api/app/routers/reporting.py):
// "Reporte Semanal de Desempeño por Oficina y Programa" (docs/CONTEXT-data-pipelines-nexova.md).
import { request } from "@/lib/account";

export interface WeeklyEntry {
  office: "valencia" | "miami";
  programme_id: string;
  total_material_cost: number;
  kits_delivered_count: number;
  shortage_events_count: number;
  cost_variance_events_count: number;
  currency: "EUR" | "USD";
}

export interface WeeklyPerformance {
  week_start: string | null;
  entries: WeeklyEntry[];
}

export interface PipelineRun {
  run_id: string;
  trigger: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  window_start: string;
  window_end: string;
  rows_upserted: number | null;
  failed_phase: string | null;
}

export function getWeeklyPerformance(weekStart?: string): Promise<WeeklyPerformance> {
  const query = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : "";
  return request<WeeklyPerformance>(`/reporting/weekly-office-program-performance${query}`);
}

export function listReportWeeks(): Promise<string[]> {
  return request<string[]>("/reporting/weeks");
}

export function getLatestRun(): Promise<PipelineRun> {
  return request<PipelineRun>("/reporting/pipeline-runs/latest");
}

export function triggerPipelineRun(): Promise<{ run_id: string; status: string }> {
  return request("/reporting/pipeline-runs", { method: "POST" });
}

// --- Presentación (para Laura y Elena: sin jerga técnica) --------------------------------

export const OFFICE_LABELS: Record<WeeklyEntry["office"], string> = {
  valencia: "Valencia",
  miami: "Miami",
};

// "ventas-b2b" → "Ventas b2b"
export function programmeLabel(programmeId: string): string {
  const text = programmeId.replace(/-/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatMoney(amount: number, currency: WeeklyEntry["currency"]): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
}

// "2026-11-09" → "semana del 9 al 15 de noviembre de 2026"
export function weekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const day = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "UTC" });
  const full = (d: Date) =>
    d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return start.getUTCMonth() === end.getUTCMonth()
    ? `semana del ${day(start)} al ${full(end)}`
    : `semana del ${full(start)} al ${full(end)}`;
}
