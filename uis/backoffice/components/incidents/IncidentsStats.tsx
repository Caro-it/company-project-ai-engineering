"use client";

import { useEffect, useState } from "react";

import {
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  ORIGINS,
  ORIGIN_LABELS,
  STATUSES,
  STATUS_LABELS,
  getIncidentStats,
  incidentErrorMessage,
  type IncidentStats,
} from "@/lib/incidents";

interface Result {
  key: string;
  stats: IncidentStats | null;
  error: string | null;
}

function StatsBlock({
  title,
  keys,
  labels,
  counts,
}: {
  title: string;
  keys: readonly string[];
  labels: Record<string, string>;
  counts: Record<string, number>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-[#001D4A]">{title}</h3>
      <dl className="mt-2 space-y-1 text-sm">
        {keys.map((key) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-slate-600">{labels[key]}</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">
              {counts[key] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Totales de /api/incidents/summary. Carga y error propios: si falla, el listado sigue.
// refreshKey lo cambia el padre (p. ej. tras un cambio de estado) para recargar.
export function IncidentsStats({ refreshKey }: { refreshKey: number }) {
  const [retries, setRetries] = useState(0);
  const [result, setResult] = useState<Result>({
    key: "",
    stats: null,
    error: null,
  });

  const requestKey = `${refreshKey}-${retries}`;
  // Cargando mientras la respuesta guardada no corresponde a la petición actual
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getIncidentStats()
      .then((stats) => {
        if (!cancelled) setResult({ key: requestKey, stats, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setResult((prev) => ({
            key: requestKey,
            stats: prev.stats,
            error: incidentErrorMessage(e),
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const { stats, error } = result;

  return (
    <section
      aria-labelledby="resumen-titulo"
      aria-busy={loading}
      data-testid="incidents-stats"
      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="resumen-titulo" className="text-base font-semibold text-[#001D4A]">
          Resumen
        </h2>
        <p className="text-sm text-slate-600" aria-live="polite">
          {loading && !stats
            ? "Cargando resumen…"
            : stats
              ? `${stats.total} incidencias en total`
              : ""}
        </p>
      </div>

      {error && !loading && (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
        >
          <span>No se ha podido cargar el resumen. {error}</span>
          <button
            type="button"
            onClick={() => setRetries((n) => n + 1)}
            className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
          >
            Reintentar
          </button>
        </div>
      )}

      {stats && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatsBlock
            title="Por estado"
            keys={STATUSES}
            labels={STATUS_LABELS}
            counts={stats.by_status}
          />
          <StatsBlock
            title="Por categoría"
            keys={CATEGORIES}
            labels={CATEGORY_LABELS}
            counts={stats.by_category}
          />
          <StatsBlock
            title="Por origen"
            keys={ORIGINS}
            labels={ORIGIN_LABELS}
            counts={stats.by_origin}
          />
          <StatsBlock
            title="Por sede"
            keys={BRANCHES}
            labels={BRANCH_LABELS}
            counts={stats.by_branch}
          />
        </div>
      )}
    </section>
  );
}
