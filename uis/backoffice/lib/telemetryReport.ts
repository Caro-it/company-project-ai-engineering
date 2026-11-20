// Cliente de GET /telemetry/report (reporte técnico de telemetría, services/api).
// Lo usa la vista /telemetria del backoffice: solo lectura, con la sesión del usuario.
import { request } from "@/lib/account";

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface TelemetryReport {
  period: ReportPeriod;
  metrics: {
    events_per_day: { day: string; event_type: string; events: number }[];
    error_rate_by_day: {
      day: string;
      events: number;
      errors: number;
      warnings: number;
      error_rate: number;
      warn_rate: number;
    }[];
    page_load_by_day: {
      day: string;
      page: string;
      samples: number;
      lcp_median_ms: number;
      lcp_p75_ms: number;
    }[];
    auth_failure_rate: { day: string; attempts: number; failed: number; failure_rate: number }[];
    request_failures_by_route: {
      day: string;
      route: string;
      failure_type: string;
      failures: number;
      avg_elapsed_ms: number;
    }[];
    frontend_errors_by_fingerprint: {
      fingerprint: string;
      error_name: string | null;
      page: string | null;
      occurrences: number;
      sessions: number;
      last_seen: string;
    }[];
  };
}

// Fechas del formulario (YYYY-MM-DD, día completo en UTC) → parámetros del endpoint.
// Sin fechas: el endpoint usa los últimos 7 días.
export function getTelemetryReport(from?: string, to?: string): Promise<TelemetryReport> {
  const params = new URLSearchParams();
  if (from) params.set("start_date", `${from}T00:00:00Z`);
  if (to) {
    // fin exclusivo: el día "hasta" se incluye entero
    const end = new Date(`${to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    params.set("end_date", end.toISOString());
  }
  const query = params.toString();
  return request<TelemetryReport>(`/telemetry/report${query ? `?${query}` : ""}`);
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
}

export function formatUtc(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
