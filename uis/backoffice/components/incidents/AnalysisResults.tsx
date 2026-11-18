"use client";

import { StatCard } from "@/components/StatCard";
import type { AnalyzeResponse } from "@/lib/incidents";

// Resultados del analizador. Se carga en diferido (next/dynamic en IncidentsAnalyzer):
// solo hacen falta después de subir un CSV, así que no viajan en el JS inicial de
// /incidencias/analizador. Ver CACHING_REPORT.md → Decisiones en el frontend.

const SCORE_LABELS: Record<string, string> = {
  "1": "Muy insatisfecho",
  "2": "Insatisfecho",
  "3": "Neutral",
  "4": "Satisfecho",
  "5": "Muy satisfecho",
};

function pct(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)} %` : "0.0 %";
}

function BreakdownTable({
  title,
  data,
  total,
  labels,
}: {
  title: string;
  data: Record<string, number>;
  total: number;
  labels?: Record<string, string>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#001D4A]">{title}</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th scope="col" className="py-2 font-medium">
              Valor
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Cantidad
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([key, count]) => (
            <tr key={key} className="border-b border-slate-100 last:border-0">
              <th
                scope="row"
                className="py-2 text-left font-medium text-slate-800"
              >
                {labels?.[key] ? `${key} · ${labels[key]}` : key}
              </th>
              <td className="py-2 text-right tabular-nums">{count}</td>
              <td className="py-2 text-right text-slate-600 tabular-nums">
                {pct(count, total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function AnalysisResults({
  result,
}: {
  result: AnalyzeResponse;
}) {
  const summary = result.summary;
  const invalidRules = Object.entries(summary.invalid_by_rule ?? {}).filter(
    ([, count]) => count > 0,
  );

  return (
    <>
      {invalidRules.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
        >
          <p className="font-semibold">
            El fichero contiene {summary.invalid_records} registro
            {summary.invalid_records === 1 ? "" : "s"} inválido
            {summary.invalid_records === 1 ? "" : "s"}, excluido
            {summary.invalid_records === 1 ? "" : "s"} del análisis:
          </p>
          <ul className="mt-2 list-inside list-disc text-sm">
            {invalidRules.map(([rule, count]) => (
              <li key={rule}>
                {result.invalid_rule_labels?.[rule] ?? rule}:{" "}
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Registros en el fichero"
          value={String(summary.total_records)}
        />
        <StatCard
          label="Registros válidos"
          value={String(summary.valid_records)}
          detail={pct(summary.valid_records, summary.total_records)}
        />
        <StatCard
          label="Registros inválidos"
          value={String(summary.invalid_records)}
          detail="Excluidos del análisis"
        />
        <StatCard
          label="Satisfacción media"
          value={`${(summary.satisfaction?.average ?? 0).toFixed(2)} / 5`}
          detail={`${summary.satisfaction?.scored ?? 0} de ${summary.satisfaction?.closed ?? 0} tickets cerrados con puntuación`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Por categoría (registros válidos)"
          data={summary.by_category ?? {}}
          total={summary.valid_records}
        />
        <BreakdownTable
          title="Por estado (registros válidos)"
          data={summary.by_status ?? {}}
          total={summary.valid_records}
        />
      </div>

      <BreakdownTable
        title="Distribución de satisfacción (tickets cerrados)"
        data={summary.satisfaction?.distribution ?? {}}
        total={summary.satisfaction?.scored ?? 0}
        labels={SCORE_LABELS}
      />

      <p className="text-sm text-slate-600">
        Fichero analizado: {result.filename}
      </p>
    </>
  );
}
