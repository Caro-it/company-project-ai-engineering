"use client";

// "Reporte Semanal de Desempeño por Oficina y Programa" para Laura (CEO) y Elena (L&D).
// Un bloque por KPI del BRIEFING (docs/CONTEXT-data-pipelines-nexova.md §2), con su nombre
// exacto, la semana que cubre y cada oficina en su moneda (nunca sumadas entre sí).
import { useEffect, useState } from "react";

import { Empty, ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import { ApiError, errorMessage } from "@/lib/account";
import {
  OFFICE_LABELS,
  formatMoney,
  getLatestRun,
  getWeeklyPerformance,
  listReportWeeks,
  programmeLabel,
  triggerPipelineRun,
  weekLabel,
  type PipelineRun,
  type WeeklyEntry,
  type WeeklyPerformance,
} from "@/lib/reporting";

type Kpi = {
  key: keyof Pick<
    WeeklyEntry,
    "total_material_cost" | "kits_delivered_count" | "shortage_events_count" | "cost_variance_events_count"
  >;
  title: string;
  question: string;
  format: (entry: WeeklyEntry) => string;
  alert?: boolean;
};

// Nombres idénticos a la sección "KPIs a medir" del BRIEFING
const KPIS: Kpi[] = [
  {
    key: "total_material_cost",
    title: "Costo de material por oficina/programa",
    question: "Cuánto se gastó esta semana en material de formación o incorporación para cada programa.",
    format: (e) => formatMoney(e.total_material_cost, e.currency),
  },
  {
    key: "kits_delivered_count",
    title: "Kits entregados",
    question: "Cuántas entregas de kits o certificados llegaron a clientes, candidatos, consultores o agentes.",
    format: (e) => `${e.kits_delivered_count}`,
  },
  {
    key: "shortage_events_count",
    title: "Frecuencia de escasez",
    question: "Cuántas veces el material de un programa bajó del mínimo: hay que reimprimir o reponer.",
    format: (e) => `${e.shortage_events_count}`,
    alert: true,
  },
  {
    key: "cost_variance_events_count",
    title: "Frecuencia de variación de costo",
    question: "Cuántas veces un proveedor cobró bastante más (o menos) de lo habitual: posible renegociación.",
    format: (e) => `${e.cost_variance_events_count}`,
    alert: true,
  },
];

const th = "px-3 py-2 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase";
const td = "px-3 py-2 text-sm text-slate-800";

function KpiCard({ kpi, entries }: { kpi: Kpi; entries: WeeklyEntry[] }) {
  const max = Math.max(1, ...entries.map((e) => Number(e[kpi.key])));
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby={`kpi-${kpi.key}`}>
      <h2 id={`kpi-${kpi.key}`} className="text-base font-semibold text-[#001D4A]">
        {kpi.title}
      </h2>
      <p className="mt-1 text-sm text-slate-600">{kpi.question}</p>
      <table className="mt-3 min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            <th className={th}>Oficina</th>
            <th className={th}>Programa</th>
            <th className={`${th} w-1/2`}>
              <span className="sr-only">Gráfico</span>
            </th>
            <th className={`${th} text-right`}>Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => {
            const value = Number(entry[kpi.key]);
            const highlight = kpi.alert && value > 0;
            return (
              <tr key={`${entry.office}-${entry.programme_id}`} data-testid={`kpi-${kpi.key}-row`}>
                <td className={td}>{OFFICE_LABELS[entry.office]}</td>
                <td className={td}>{programmeLabel(entry.programme_id)}</td>
                <td className={td}>
                  <span
                    aria-hidden="true"
                    className={`block h-3 rounded ${highlight ? "bg-rose-500" : "bg-[#ECA400]"}`}
                    style={{ width: `${(value / max) * 100}%`, minWidth: value > 0 ? "4px" : 0 }}
                  />
                </td>
                <td className={`${td} text-right font-semibold tabular-nums ${highlight ? "text-rose-700" : ""}`}>
                  {kpi.format(entry)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function RunStatus({ run }: { run: PipelineRun | null }) {
  if (!run) return <span>Los datos todavía no se han calculado.</span>;
  const when = new Date(run.finished_at ?? run.started_at).toLocaleString("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (run.status === "running") return <span>Actualizando los datos…</span>;
  if (run.status === "failed") {
    return <span className="text-rose-700">La última actualización ({when}) falló; se muestran los últimos datos correctos.</span>;
  }
  return <span>Datos actualizados el {when}.</span>;
}

export function WeeklyPerformanceDashboard() {
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [report, setReport] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: WeeklyPerformance }
  >({ status: "loading" });
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getWeeklyPerformance(selected), listReportWeeks(), getLatestRun().catch(() => null)])
      .then(([data, weekList, latest]) => {
        if (cancelled) return;
        setReport({ status: "ready", data });
        setWeeks(weekList);
        setRun(latest);
      })
      .catch((e) => {
        if (!cancelled) setReport({ status: "error", message: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [selected, refreshKey]);

  async function refreshData() {
    setNotice(null);
    try {
      await triggerPipelineRun();
      setNotice("Actualización en marcha. Los datos estarán listos en unos segundos.");
      setTimeout(() => setRefreshKey((k) => k + 1), 8000);
    } catch (e) {
      setNotice(
        e instanceof ApiError && e.status === 403
          ? "Solo dirección (admin o manager) puede actualizar los datos."
          : e instanceof ApiError && e.status === 409
            ? "Ya hay una actualización en marcha."
            : errorMessage(e),
      );
    }
  }

  if (report.status === "loading") return <Loading>Cargando el reporte semanal…</Loading>;
  if (report.status === "error") {
    return <ErrorBanner message={report.message} onRetry={() => setRefreshKey((k) => k + 1)} />;
  }

  const { week_start: weekStart, entries } = report.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm text-slate-600">Período</p>
          <p className="text-lg font-semibold text-[#001D4A]" data-testid="report-week">
            {weekStart ? weekLabel(weekStart) : "Sin datos todavía"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <RunStatus run={run} /> Valencia en euros y Miami en dólares: no se suman entre sí.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {weeks.length > 1 && (
            <label className="text-sm text-slate-700">
              Otra semana
              <select
                value={weekStart ?? ""}
                onChange={(e) => {
                  setReport({ status: "loading" });
                  setSelected(e.target.value);
                }}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                {weeks.map((week) => (
                  <option key={week} value={week}>
                    {weekLabel(week)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={refreshData}
            className="rounded-md border border-[#001D4A] px-3 py-1.5 text-sm font-medium text-[#001D4A] hover:bg-slate-50"
          >
            Actualizar datos
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">
          {notice}
        </p>
      )}

      {entries.length === 0 ? (
        <Empty>No hay actividad de material registrada en esta semana.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {KPIS.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} entries={entries} />
          ))}
        </div>
      )}
    </div>
  );
}
