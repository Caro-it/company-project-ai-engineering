"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ALLOWED_TRANSITIONS,
  BRANCHES,
  BRANCH_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  EMPTY_FILTERS,
  ORIGINS,
  ORIGIN_LABELS,
  STATUSES,
  STATUS_LABELS,
  changeIncidentStatus,
  formatIncidentDate,
  incidentErrorMessage,
  listIncidents,
  type Incident,
  type IncidentFilters,
  type IncidentStatus,
} from "@/lib/incidents";

interface Result {
  key: string;
  incidents: Incident[];
  error: string | null;
}

const STATUS_BADGE: Record<IncidentStatus, string> = {
  open: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  discarded: "bg-slate-200 text-slate-700",
};

const selectClass =
  "mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

function FilterSelect<T extends string>({
  id,
  label,
  allLabel,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  value: T | "";
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T | "") => void;
}) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className={selectClass}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </div>
  );
}

// onStatusChanged: lo usa la página para refrescar el resumen tras un cambio de estado
export function IncidentsList({
  onStatusChanged,
}: {
  onStatusChanged: () => void;
}) {
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS);
  const [retries, setRetries] = useState(0);
  const [result, setResult] = useState<Result>({
    key: "",
    incidents: [],
    error: null,
  });

  // Cada cambio de filtro (o reintento) es una petición nueva a la API
  const requestKey = JSON.stringify({ ...filters, retries });
  const loading = result.key !== requestKey;

  useEffect(() => {
    let cancelled = false;
    listIncidents(filters)
      .then((incidents) => {
        if (!cancelled) setResult({ key: requestKey, incidents, error: null });
      })
      .catch((e) => {
        if (!cancelled)
          setResult({
            key: requestKey,
            incidents: [],
            error: incidentErrorMessage(e),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [filters, requestKey]);

  function setFilter<K extends keyof IncidentFilters>(
    key: K,
    value: IncidentFilters[K],
  ) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function setRowStatus(id: string, status: IncidentStatus) {
    setResult((prev) => ({
      ...prev,
      incidents: prev.incidents.map((i) => (i.id === id ? { ...i, status } : i)),
    }));
  }

  function replaceIncident(updated: Incident) {
    setResult((prev) => ({
      ...prev,
      incidents: prev.incidents.map((i) => (i.id === updated.id ? updated : i)),
    }));
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const { incidents, error } = result;

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="filtros-incidencias-titulo"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2
          id="filtros-incidencias-titulo"
          className="text-sm font-semibold text-[#001D4A]"
        >
          Filtros
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <FilterSelect
            id="filtro-status"
            label="Estado"
            allLabel="Todos"
            value={filters.status}
            options={STATUSES}
            labels={STATUS_LABELS}
            onChange={(v) => setFilter("status", v)}
          />
          <FilterSelect
            id="filtro-origin"
            label="Origen"
            allLabel="Todos"
            value={filters.origin}
            options={ORIGINS}
            labels={ORIGIN_LABELS}
            onChange={(v) => setFilter("origin", v)}
          />
          <FilterSelect
            id="filtro-branch"
            label="Sede"
            allLabel="Todas"
            value={filters.branch}
            options={BRANCHES}
            labels={BRANCH_LABELS}
            onChange={(v) => setFilter("branch", v)}
          />
          <FilterSelect
            id="filtro-category"
            label="Categoría"
            allLabel="Todas"
            value={filters.category}
            options={CATEGORIES}
            labels={CATEGORY_LABELS}
            onChange={(v) => setFilter("category", v)}
          />
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          )}
          <p className="ml-auto text-sm text-slate-500" aria-live="polite">
            {loading
              ? "Cargando…"
              : error
                ? ""
                : `${incidents.length} incidencias`}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="listado-incidencias-titulo"
        aria-busy={loading}
        data-testid="incidents-list"
      >
        <h2 id="listado-incidencias-titulo" className="sr-only">
          Listado de incidencias
        </h2>

        {loading ? (
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Cargando incidencias…
          </p>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <span>No se ha podido cargar el listado. {error}</span>
            <button
              type="button"
              onClick={() => setRetries((n) => n + 1)}
              className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
            >
              Reintentar
            </button>
          </div>
        ) : incidents.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            {hasFilters ? (
              <>
                <p>Ninguna incidencia coincide con los filtros elegidos.</p>
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              </>
            ) : (
              <>
                <p>Todavía no hay incidencias registradas.</p>
                <Link
                  href="/incidencias/nueva"
                  className="mt-3 inline-block font-medium text-[#006992] underline underline-offset-2"
                >
                  Registrar la primera incidencia
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">
                Incidencias de Nexova, de la más reciente a la más antigua
              </caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Incidencia
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Categoría
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Origen
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Sede
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Alta
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Cambiar estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.map((incident) => (
                  <IncidentRow
                    key={incident.id}
                    incident={incident}
                    onOptimistic={setRowStatus}
                    onSaved={(updated) => {
                      replaceIncident(updated);
                      onStatusChanged();
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function IncidentRow({
  incident,
  onOptimistic,
  onSaved,
}: {
  incident: Incident;
  onOptimistic: (id: string, status: IncidentStatus) => void;
  onSaved: (updated: Incident) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const next = ALLOWED_TRANSITIONS[incident.status] ?? [];
  const selectId = `estado-${incident.id}`;

  // Actualización optimista: se pinta el estado nuevo y, si la API falla, se vuelve atrás
  async function change(status: IncidentStatus) {
    const previous = incident.status;
    setRowError(null);
    setBusy(true);
    onOptimistic(incident.id, status);
    try {
      onSaved(await changeIncidentStatus(incident.id, status));
    } catch (e) {
      onOptimistic(incident.id, previous);
      setRowError(
        `No se ha cambiado el estado. ${incidentErrorMessage(e)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr data-testid="incident-row" data-incident-id={incident.id}>
      <td className="max-w-md px-4 py-3 align-top">
        <p className="font-medium text-[#001D4A]">{incident.title}</p>
        {incident.description !== incident.title && (
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
            {incident.description}
          </p>
        )}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {CATEGORY_LABELS[incident.category] ?? incident.category}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {ORIGIN_LABELS[incident.origin] ?? incident.origin}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {BRANCH_LABELS[incident.branch] ?? incident.branch}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {formatIncidentDate(incident.created_at)}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        <span
          data-testid="incident-status"
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[incident.status] ?? ""}`}
        >
          {STATUS_LABELS[incident.status] ?? incident.status}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        {next.length === 0 ? (
          <span className="text-xs text-slate-500">Estado final</span>
        ) : (
          <>
            <label htmlFor={selectId} className="sr-only">
              Cambiar el estado de «{incident.title}»
            </label>
            <select
              id={selectId}
              value=""
              disabled={busy}
              aria-busy={busy}
              onChange={(e) => {
                if (e.target.value) change(e.target.value as IncidentStatus);
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
            >
              <option value="">Cambiar a…</option>
              {next.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </>
        )}
        {rowError && (
          <p
            role="alert"
            className="mt-1 max-w-xs text-xs whitespace-normal text-rose-700"
          >
            {rowError}
          </p>
        )}
      </td>
    </tr>
  );
}
