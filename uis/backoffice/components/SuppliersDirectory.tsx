"use client";

import { SupplierForm } from "@/components/SupplierForm";
import { useEffect, useState } from "react";

import {
  CATEGORIES,
  CATEGORY_LABELS,
  COUNTRIES,
  daysUntil,
  listSuppliers,
  updateRate,
  updateStatus,
  type Category,
  type Country,
  type Supplier,
} from "@/lib/suppliers";
import { ApiError, errorMessage } from "@/lib/account";

const RENEWAL_WINDOW_DAYS = 60;

const COUNTRY_LABELS: Record<Country, string> = {
  Spain: "España",
  USA: "Estados Unidos",
};

function errorText(e: unknown): string {
  // El único 422 de las filas es una tarifa no positiva (monthly_rate gt=0)
  if (e instanceof ApiError && e.status === 422) return "La tarifa debe ser mayor que 0.";
  return errorMessage(e);
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    amount,
  );
}

// Una fecha vacía o mal formada se muestra como «—» en vez de romper la tabla
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

export function SuppliersDirectory() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [country, setCountry] = useState<Country | "">("");
  const [category, setCategory] = useState<Category | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Se vuelve a pedir el listado a la API cada vez que cambia un filtro (sin recargar la página)
  useEffect(() => {
    let cancelled = false;
    listSuppliers({ country, category })
      .then((data) => {
        if (cancelled) return;
        setSuppliers(data);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setSuppliers([]);
        setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, category, reloadKey]);

  function reload() {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  // Sustituye la fila por lo que devolvió la API tras un PATCH
  function replaceSupplier(updated: Supplier) {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s)),
    );
  }

  const hasFilters = country !== "" || category !== "";

  return (
    <div className="space-y-6">
      <SupplierForm onCreated={reload} />

      <section
        aria-labelledby="filtros-titulo"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2
          id="filtros-titulo"
          className="text-sm font-semibold text-[#001D4A]"
        >
          Filtros
        </h2>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-slate-700">
            País
            <select
              value={country}
              onChange={(e) => {
                setLoading(true);
                setCountry(e.target.value as Country | "");
              }}
              className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todos</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm text-slate-700">
            Categoría
            <select
              value={category}
              onChange={(e) => {
                setLoading(true);
                setCategory(e.target.value as Category | "");
              }}
              className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setCountry("");
                setCategory("");
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          )}

          <p className="ml-auto text-sm text-slate-500" aria-live="polite">
            {loading ? "Cargando…" : error ? "" : `${suppliers.length} proveedores`}
          </p>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={reload}
            className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">
            Directorio de proveedores de Nexova
          </caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Proveedor
              </th>
              <th scope="col" className="px-4 py-3">
                País
              </th>
              <th scope="col" className="px-4 py-3">
                Categorías
              </th>
              <th scope="col" className="px-4 py-3">
                Tarifa mensual
              </th>
              <th scope="col" className="px-4 py-3">
                Renovación
              </th>
              <th scope="col" className="px-4 py-3">
                Estado
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((s) => (
              <SupplierRow
                key={s.id}
                supplier={s}
                onUpdated={replaceSupplier}
              />
            ))}
            {!loading && !error && suppliers.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No hay proveedores que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  onUpdated,
}: {
  supplier: Supplier;
  onUpdated: (s: Supplier) => void;
}) {
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  const isActive = supplier.status === "active";
  const days = daysUntil(supplier.contract_renewal_date);
  const renewalSoon = days !== null && days >= 0 && days <= RENEWAL_WINDOW_DAYS;
  const renewalPast = days !== null && days < 0;

  function startEdit() {
    setRateInput(String(supplier.monthly_rate));
    setRowError(null);
    setEditingRate(true);
  }

  async function saveRate() {
    if (rateInput.trim() === "" || Number.isNaN(Number(rateInput))) {
      setRowError("Introduce un número.");
      return;
    }
    setBusy(true);
    setRowError(null);
    try {
      // El 0 y los negativos los rechaza la API (422) y su mensaje se muestra aquí
      onUpdated(await updateRate(supplier.id, Number(rateInput)));
      setEditingRate(false);
    } catch (e) {
      setRowError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    setRowError(null);
    try {
      onUpdated(
        await updateStatus(supplier.id, isActive ? "suspended" : "active"),
      );
    } catch (e) {
      setRowError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={isActive ? "bg-white" : "bg-slate-50 text-slate-500"}>
      <td className="px-4 py-3 align-top">
        <p
          className={`font-medium ${isActive ? "text-[#001D4A]" : "text-slate-500"}`}
        >
          {supplier.name}
        </p>
        {supplier.contact_email && (
          <p className="text-xs text-slate-500">{supplier.contact_email}</p>
        )}
      </td>

      <td className="px-4 py-3 align-top whitespace-nowrap">
        {COUNTRY_LABELS[supplier.country] ?? supplier.country}
      </td>

      <td className="px-4 py-3 align-top">
        <ul className="flex flex-wrap gap-1">
          {(supplier.categories ?? []).map((c) => (
            <li
              key={c}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {CATEGORY_LABELS[c] ?? c}
            </li>
          ))}
        </ul>
      </td>

      <td className="px-4 py-3 align-top whitespace-nowrap">
        {editingRate ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveRate();
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor={`rate-${supplier.id}`} className="sr-only">
              Nueva tarifa mensual de {supplier.name}
            </label>
            <input
              id={`rate-${supplier.id}`}
              type="number"
              step="0.01"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-28 rounded-md border border-slate-300 px-2 py-1"
              autoFocus
            />
            <span className="text-xs text-slate-500">{supplier.currency}</span>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[#001D4A] px-2 py-1 text-xs font-medium text-white hover:bg-[#002a6b] disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditingRate(false)}
              className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">
                {formatMoney(supplier.monthly_rate, supplier.currency)}
              </span>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-md px-2 py-0.5 text-xs text-[#001D4A] underline underline-offset-2 hover:bg-slate-100"
              >
                Editar
                <span className="sr-only"> tarifa de {supplier.name}</span>
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Actualizada {formatDateTime(supplier.updated_at)}
            </p>
          </div>
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

      <td className="px-4 py-3 align-top whitespace-nowrap">
        {supplier.contract_renewal_date ? (
          <div>
            <p>{formatDate(supplier.contract_renewal_date)}</p>
            {renewalSoon && (
              <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {days === 0 ? "Renueva hoy" : `Renueva en ${days} días`}
              </span>
            )}
            {renewalPast && (
              <p className="text-xs text-slate-400">Fecha pasada</p>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>

      <td className="px-4 py-3 align-top whitespace-nowrap">
        {isActive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-emerald-600"
            />
            Activo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-800">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-rose-600"
            />
            Suspendido
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-right align-top whitespace-nowrap">
        <button
          type="button"
          onClick={toggleStatus}
          disabled={busy}
          className={`rounded-md border px-3 py-1 text-xs font-medium disabled:opacity-50 ${
            isActive
              ? "border-rose-300 text-rose-700 hover:bg-rose-50"
              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          }`}
        >
          {isActive ? "Suspender" : "Activar"}
          <span className="sr-only"> {supplier.name}</span>
        </button>
      </td>
    </tr>
  );
}
