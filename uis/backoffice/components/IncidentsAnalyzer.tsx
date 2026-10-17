"use client";

import { StatCard } from "@/components/StatCard";
import {
    analyzeIncidents,
    downloadResults,
    type AnalyzeResponse,
} from "@/lib/incidents";
import { useState } from "react";

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

export function IncidentsAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function pickFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await analyzeIncidents(file));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setDownloading(false);
    }
  }

  const summary = result?.summary;
  const invalidRules = summary
    ? Object.entries(summary.invalid_by_rule).filter(([, count]) => count > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Carga de fichero: clic o arrastrar */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <label
          htmlFor="csv-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver
              ? "border-[#ECA400] bg-amber-50"
              : "border-slate-300 hover:border-[#001D4A]"
          }`}
        >
          <span className="font-semibold text-[#001D4A]">
            Arrastra aquí el CSV de incidencias o haz clic para seleccionarlo
          </span>
          <span className="mt-1 text-sm text-slate-600">
            {file
              ? `Seleccionado: ${file.name}`
              : "Formato .csv, codificación UTF-8"}
          </span>
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="rounded-md bg-[#001D4A] px-4 py-2 font-semibold text-white hover:bg-[#002b6e] focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analizando…" : "Analizar fichero"}
          </button>
          {summary && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-md border border-[#001D4A] px-4 py-2 font-semibold text-[#001D4A] hover:bg-slate-50 focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden disabled:opacity-50"
            >
              {downloading ? "Descargando…" : "Descargar resultados (CSV)"}
            </button>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          <p className="font-semibold">No se pudo completar la operación</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {summary && result && (
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
                    {result.invalid_rule_labels[rule] ?? rule}:{" "}
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
              value={`${summary.satisfaction.average.toFixed(2)} / 5`}
              detail={`${summary.satisfaction.scored} de ${summary.satisfaction.closed} tickets cerrados con puntuación`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable
              title="Por categoría (registros válidos)"
              data={summary.by_category}
              total={summary.valid_records}
            />
            <BreakdownTable
              title="Por estado (registros válidos)"
              data={summary.by_status}
              total={summary.valid_records}
            />
          </div>

          <BreakdownTable
            title="Distribución de satisfacción (tickets cerrados)"
            data={summary.satisfaction.distribution}
            total={summary.satisfaction.scored}
            labels={SCORE_LABELS}
          />

          <p className="text-sm text-slate-600">
            Fichero analizado: {result.filename}
          </p>
        </>
      )}
    </div>
  );
}
