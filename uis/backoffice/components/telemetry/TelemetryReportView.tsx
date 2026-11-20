"use client";

// Vista técnica de GET /telemetry/report: una tabla por métrica, con barras CSS para el
// volumen diario (sin librerías de gráficos: el backoffice no tiene ninguna).
import { useCallback, useEffect, useMemo, useState } from "react";

import { Empty, ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import { errorMessage } from "@/lib/account";
import {
  formatPercent,
  formatUtc,
  getTelemetryReport,
  type TelemetryReport,
} from "@/lib/telemetryReport";

const th = "px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase";
const td = "px-3 py-2 text-sm text-slate-700";
const num = `${td} text-right tabular-nums`;

function Section({ title, question, children }: { title: string; question: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold text-[#001D4A]">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{question}</p>
      <div className="mt-3 overflow-x-auto">{children}</div>
    </section>
  );
}

function NoData() {
  return <p className="text-sm text-slate-500">Sin eventos en el período.</p>;
}

export function TelemetryReportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; report: TelemetryReport }
  >({ status: "loading" });

  // Período pedido; `key` fuerza una nueva petición aunque las fechas no cambien
  const [query, setQuery] = useState<{ from?: string; to?: string; key: number }>({ key: 0 });

  useEffect(() => {
    let cancelled = false;
    getTelemetryReport(query.from, query.to)
      .then((report) => {
        if (!cancelled) setState({ status: "ready", report });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", message: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const load = useCallback((start?: string, end?: string) => {
    setState({ status: "loading" });
    setQuery((q) => ({ from: start, to: end, key: q.key + 1 }));
  }, []);

  const dailyTotals = useMemo(() => {
    if (state.status !== "ready") return [];
    const totals = new Map<string, number>();
    for (const row of state.report.metrics.events_per_day) {
      totals.set(row.day, (totals.get(row.day) ?? 0) + row.events);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [state]);

  const filters = (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        load(from || undefined, to || undefined);
      }}
    >
      <label className="text-sm text-slate-700">
        Desde (UTC)
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <label className="text-sm text-slate-700">
        Hasta (UTC, incluido)
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" />
      </label>
      <button type="submit" className="rounded-md bg-[#001D4A] px-3 py-1.5 text-sm font-medium text-white">
        Ver período
      </button>
      <button
        type="button"
        onClick={() => {
          setFrom("");
          setTo("");
          load();
        }}
        className="rounded-md px-2 py-1.5 text-sm text-slate-600 underline"
      >
        Últimos 7 días
      </button>
    </form>
  );

  if (state.status === "loading") return <>{filters}<Loading>Calculando el reporte…</Loading></>;
  if (state.status === "error") return <>{filters}<ErrorBanner message={state.message} onRetry={() => load(from || undefined, to || undefined)} /></>;

  const { period, metrics } = state.report;
  const maxDaily = Math.max(1, ...dailyTotals.map(([, n]) => n));
  const hasData = metrics.events_per_day.length > 0;

  return (
    <div className="space-y-4">
      {filters}
      <p className="text-sm text-slate-700" data-testid="report-period">
        Período: <strong>{formatUtc(period.from)}</strong> → <strong>{formatUtc(period.to)}</strong> (UTC, fin
        excluido). El reporte se recalcula como mucho cada 60 s.
      </p>

      {!hasData ? (
        <Empty>No hay eventos de telemetría en este período.</Empty>
      ) : (
        <>
          <Section title="Volumen de eventos por día" question="¿Cuánta actividad registra el sistema cada día?">
            <ul className="space-y-1">
              {dailyTotals.map(([day, total]) => (
                <li key={day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-slate-700">{day}</span>
                  <span className="h-4 rounded bg-[#ECA400]" style={{ width: `${(total / maxDaily) * 70}%` }} aria-hidden="true" />
                  <span className="tabular-nums text-slate-700">{total}</span>
                </li>
              ))}
            </ul>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-600">Detalle por tipo de evento</summary>
              <table className="mt-2 min-w-full divide-y divide-slate-200">
                <thead><tr><th className={th}>Día</th><th className={th}>event_type</th><th className={`${th} text-right`}>Eventos</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.events_per_day.map((r) => (
                    <tr key={`${r.day}-${r.event_type}`}><td className={td}>{r.day}</td><td className={`${td} font-mono text-xs`}>{r.event_type}</td><td className={num}>{r.events}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Section>

          <Section title="Tasa de errores y avisos por día" question="¿Qué parte de los eventos son errores técnicos (error) o rechazos y fallos (warn)?">
            <table className="min-w-full divide-y divide-slate-200">
              <thead><tr><th className={th}>Día</th><th className={`${th} text-right`}>Eventos</th><th className={`${th} text-right`}>Errores</th><th className={`${th} text-right`}>Tasa error</th><th className={`${th} text-right`}>Avisos</th><th className={`${th} text-right`}>Tasa aviso</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.error_rate_by_day.map((r) => (
                  <tr key={r.day}><td className={td}>{r.day}</td><td className={num}>{r.events}</td><td className={num}>{r.errors}</td><td className={num}>{formatPercent(r.error_rate)}</td><td className={num}>{r.warnings}</td><td className={num}>{formatPercent(r.warn_rate)}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Carga de páginas (LCP)" question="¿Qué tan rápido ven la página los usuarios reales? Objetivo: p75 por debajo de 2.500 ms.">
            {metrics.page_load_by_day.length === 0 ? <NoData /> : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead><tr><th className={th}>Día</th><th className={th}>Página</th><th className={`${th} text-right`}>Muestras</th><th className={`${th} text-right`}>Mediana</th><th className={`${th} text-right`}>p75</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.page_load_by_day.map((r) => (
                    <tr key={`${r.day}-${r.page}`}><td className={td}>{r.day}</td><td className={`${td} font-mono text-xs`}>{r.page}</td><td className={num}>{r.samples}</td><td className={num}>{r.lcp_median_ms} ms</td><td className={`${num} ${r.lcp_p75_ms > 2500 ? "font-semibold text-rose-700" : ""}`}>{r.lcp_p75_ms} ms</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Fallos de login por día" question="¿Cuántos intentos de login fallan? (login_failed / intentos)">
            {metrics.auth_failure_rate.length === 0 ? <NoData /> : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead><tr><th className={th}>Día</th><th className={`${th} text-right`}>Intentos</th><th className={`${th} text-right`}>Fallidos</th><th className={`${th} text-right`}>Tasa de fallo</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.auth_failure_rate.map((r) => (
                    <tr key={r.day}><td className={td}>{r.day}</td><td className={num}>{r.attempts}</td><td className={num}>{r.failed}</td><td className={num}>{formatPercent(r.failure_rate)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Peticiones a la API sin respuesta" question="¿Dónde se pierde la conexión entre el backoffice y la API?">
            {metrics.request_failures_by_route.length === 0 ? <NoData /> : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead><tr><th className={th}>Día</th><th className={th}>Ruta</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Fallos</th><th className={`${th} text-right`}>Tiempo medio</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.request_failures_by_route.map((r) => (
                    <tr key={`${r.day}-${r.route}-${r.failure_type}`}><td className={td}>{r.day}</td><td className={`${td} font-mono text-xs`}>{r.route}</td><td className={td}>{r.failure_type}</td><td className={num}>{r.failures}</td><td className={num}>{r.avg_elapsed_ms} ms</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Errores de JavaScript más repetidos" question="¿Qué fallos del frontend afectan a más sesiones?">
            {metrics.frontend_errors_by_fingerprint.length === 0 ? <NoData /> : (
              <table className="min-w-full divide-y divide-slate-200">
                <thead><tr><th className={th}>Fingerprint</th><th className={th}>Error</th><th className={th}>Página</th><th className={`${th} text-right`}>Veces</th><th className={`${th} text-right`}>Sesiones</th><th className={th}>Última vez (UTC)</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {metrics.frontend_errors_by_fingerprint.map((r) => (
                    <tr key={r.fingerprint}><td className={`${td} font-mono text-xs`}>{r.fingerprint}</td><td className={td}>{r.error_name ?? "—"}</td><td className={`${td} font-mono text-xs`}>{r.page ?? "—"}</td><td className={num}>{r.occurrences}</td><td className={num}>{r.sessions}</td><td className={td}>{formatUtc(r.last_seen)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
