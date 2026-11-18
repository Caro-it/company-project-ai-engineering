"use client";

import {
  analyzeIncidents,
  analyzerErrorMessage,
  downloadResults,
  type AnalyzeResponse,
} from "@/lib/incidents";
import dynamic from "next/dynamic";
import { useState } from "react";

// Lazy loading: tablas y tarjetas de resultados solo tras analizar un CSV
const AnalysisResults = dynamic(
  () => import("@/components/incidents/AnalysisResults"),
  {
    loading: () => (
      <p role="status" className="text-sm text-slate-600">
        Preparando resultados…
      </p>
    ),
  },
);

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
      setError(analyzerErrorMessage(e));
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
      setError(analyzerErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  const summary = result?.summary;

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

      {result && <AnalysisResults result={result} />}
    </div>
  );
}
