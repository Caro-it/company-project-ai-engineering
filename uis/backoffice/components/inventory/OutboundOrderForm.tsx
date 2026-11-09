"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  AssetSelect,
  OfficeField,
  describedBy,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/inventory/fields";
import { ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import { StockBadge } from "@/components/inventory/StockBadge";
import {
  EXIT_TYPE_LABELS,
  InventoryError,
  assetOptionLabel,
  createAssetExit,
  inventoryErrorMessage,
  listAssets,
  parseAssetId,
  parseQuantity,
} from "@/lib/inventory";
import { useAssetStock, useInventoryData } from "@/lib/useInventoryData";
import { EXIT_TYPES, type ExitType } from "@/types/inventory";

type Field = "asset_id" | "quantity" | "exit_type" | "assigned_to";
type FieldErrors = Partial<Record<Field, string>>;

// Textos por campo para los errores del cliente y los 422 de la API
const FIELD_TEXT: Record<Field, string> = {
  asset_id: "Elige un activo.",
  quantity: "Indica una cantidad entera mayor que 0.",
  exit_type: "Elige si es una asignación o un consumo.",
  assigned_to: "Indica a qué empleado se asigna (nombre o ID).",
};

export function OutboundOrderForm() {
  const searchParams = useSearchParams();
  const { state, reload } = useInventoryData(listAssets);

  const [assetId, setAssetId] = useState(
    () => parseAssetId(searchParams.get("asset_id"))?.toString() ?? "",
  );
  const [quantity, setQuantity] = useState("");
  const [exitType, setExitType] = useState<ExitType | "">("");
  const [assignedTo, setAssignedTo] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  // 400 de stock insuficiente: va junto al campo cantidad
  const [stockError, setStockError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stockKey, setStockKey] = useState(0);

  const assets = state.status === "ready" ? state.data : [];
  const selected = assets.find((a) => String(a.id) === assetId) ?? null;
  // Stock reactivo: se pide a la API cada vez que cambia el activo elegido
  const stock = useAssetStock(selected?.id ?? null, stockKey);

  if (state.status === "loading") return <Loading>Cargando activos…</Loading>;
  if (state.status === "error") {
    return <ErrorBanner message={state.message} onRetry={reload} />;
  }

  const qty = parseQuantity(quantity);
  const available = stock.status === "ready" ? stock.stock : null;
  const exceedsStock = qty !== null && available !== null && qty > available;

  function changeAsset(value: string) {
    setAssetId(value);
    setStockError(null);
  }

  function changeExitType(value: ExitType) {
    setExitType(value);
    // En un consumo assigned_to debe ir vacío (regla 3 del BRIEFING)
    if (value === "consumption") setAssignedTo("");
    setErrors((prev) => ({ ...prev, exit_type: undefined, assigned_to: undefined }));
  }

  async function handleSubmit() {
    setApiError(null);
    setStockError(null);
    setSuccess(null);

    const found: FieldErrors = {};
    if (!selected) found.asset_id = FIELD_TEXT.asset_id;
    if (qty === null) found.quantity = FIELD_TEXT.quantity;
    if (!exitType) found.exit_type = FIELD_TEXT.exit_type;
    if (exitType === "allocation" && !assignedTo.trim()) {
      found.assigned_to = FIELD_TEXT.assigned_to;
    }
    setErrors(found);
    if (!selected || qty === null || !exitType || Object.keys(found).length > 0) return;

    // Superar el stock solo muestra un aviso: la regla real la aplica la API (400)
    setSubmitting(true);
    try {
      await createAssetExit({
        asset_id: selected.id,
        quantity: qty,
        exit_type: exitType,
        assigned_to: exitType === "allocation" ? assignedTo.trim() : null,
        office: selected.office,
      });
      setSuccess(
        exitType === "allocation"
          ? `Salida registrada: ${qty} uds. de ${assetOptionLabel(selected)} asignadas a ${assignedTo.trim()}.`
          : `Salida registrada: consumo de ${qty} uds. de ${assetOptionLabel(selected)}.`,
      );
      // Se conserva el activo para ver su stock actualizado; el resto se limpia
      setQuantity("");
      setExitType("");
      setAssignedTo("");
      setStockKey((k) => k + 1);
    } catch (e) {
      if (e instanceof InventoryError && e.isInsufficientStock) {
        setStockError(e.message);
        setStockKey((k) => k + 1);
      } else {
        if (e instanceof InventoryError && e.status === 422) {
          const fromApi: FieldErrors = {};
          for (const field of Object.keys(e.fieldErrors)) {
            if (field in FIELD_TEXT) fromApi[field as Field] = FIELD_TEXT[field as Field];
          }
          setErrors(fromApi);
        }
        setApiError(inventoryErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {success && (
        <div role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {success}{" "}
          <Link href="/inventory/orders" className="font-medium underline underline-offset-2">
            Ver el historial de órdenes
          </Link>
        </div>
      )}

      <form
        noValidate
        aria-busy={submitting}
        aria-labelledby="salida-titulo"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <h2 id="salida-titulo" className="text-sm font-semibold text-[#001D4A] sm:col-span-2">
          Datos de la asignación o consumo
        </h2>

        <div className="sm:col-span-2">
          <AssetSelect
            assets={assets}
            value={selected ? assetId : ""}
            onChange={changeAsset}
            error={errors.asset_id}
          />
        </div>

        {/* Stock disponible del activo elegido, antes de escribir la cantidad */}
        <div
          aria-live="polite"
          data-testid="available-stock"
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2"
        >
          {stock.status === "idle" && "Elige un activo para ver su stock disponible."}
          {stock.status === "loading" && "Consultando el stock disponible…"}
          {stock.status === "error" && (
            <span className="text-rose-800">
              No se ha podido consultar el stock: {stock.message}
            </span>
          )}
          {stock.status === "ready" && (
            <span className="flex flex-wrap items-center gap-2">
              Stock disponible:{" "}
              <strong className="tabular-nums" data-testid="available-stock-value">
                {stock.stock} uds.
              </strong>
              <StockBadge stock={stock.stock} />
            </span>
          )}
        </div>

        <div>
          <label htmlFor="f-quantity" className={labelClass}>
            Cantidad <span aria-hidden="true">*</span>
          </label>
          <input
            id="f-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setStockError(null);
            }}
            aria-invalid={!!errors.quantity || !!stockError}
            aria-describedby={describedBy(
              errors.quantity && "f-quantity-error",
              exceedsStock && "f-quantity-warning",
              stockError && "f-quantity-api-error",
            )}
            className={inputClass}
          />
          {errors.quantity && (
            <p id="f-quantity-error" role="alert" className={errorClass}>
              {errors.quantity}
            </p>
          )}
          {exceedsStock && !stockError && (
            <p
              id="f-quantity-warning"
              role="status"
              className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900"
            >
              ⚠ La cantidad ({qty}) supera el stock disponible ({available} uds.). La salida
              será rechazada.
            </p>
          )}
          {stockError && (
            <p id="f-quantity-api-error" role="alert" className={errorClass}>
              {stockError}
            </p>
          )}
        </div>

        <OfficeField office={selected?.office ?? null} label="Oficina" />

        <fieldset
          className="sm:col-span-2"
          aria-invalid={!!errors.exit_type}
          aria-describedby={errors.exit_type ? "f-exit-type-error" : undefined}
        >
          <legend className={labelClass}>
            Tipo de salida <span aria-hidden="true">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {EXIT_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="exit_type"
                  value={type}
                  checked={exitType === type}
                  onChange={() => changeExitType(type)}
                  className="h-4 w-4 border-slate-300"
                />
                {EXIT_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          {errors.exit_type && (
            <p id="f-exit-type-error" role="alert" className={errorClass}>
              {errors.exit_type}
            </p>
          )}
        </fieldset>

        {/* Solo en asignaciones: en un consumo assigned_to va nulo (regla 3 del BRIEFING) */}
        {exitType === "allocation" && (
          <div className="sm:col-span-2">
            <label htmlFor="f-assigned-to" className={labelClass}>
              Asignado a (empleado) <span aria-hidden="true">*</span>
            </label>
            <input
              id="f-assigned-to"
              type="text"
              maxLength={200}
              placeholder="Nombre o ID del empleado"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              aria-required="true"
              aria-invalid={!!errors.assigned_to}
              aria-describedby={errors.assigned_to ? "f-assigned-to-error" : undefined}
              className={inputClass}
            />
            {errors.assigned_to && (
              <p id="f-assigned-to-error" role="alert" className={errorClass}>
                {errors.assigned_to}
              </p>
            )}
          </div>
        )}

        {apiError && (
          <p
            role="alert"
            data-testid="form-error"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2"
          >
            No se pudo registrar la salida: {apiError}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] disabled:opacity-50"
          >
            {submitting ? "Registrando…" : "Registrar salida"}
          </button>
        </div>
      </form>
    </div>
  );
}
