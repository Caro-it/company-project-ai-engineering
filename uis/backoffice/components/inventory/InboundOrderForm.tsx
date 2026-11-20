"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  AssetSelect,
  OfficeField,
  errorClass,
  inputClass,
  labelClass,
} from "@/components/inventory/fields";
import { ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import {
  CURRENCY_BY_OFFICE,
  InventoryError,
  assetOptionLabel,
  createAssetEntry,
  inventoryErrorMessage,
  listAssets,
  parseAssetId,
  parseQuantity,
  parseUnitCost,
} from "@/lib/inventory";
import { trackInboundCreated, trackInboundRejected } from "@/lib/telemetryTrackers";
import { useInventoryData } from "@/lib/useInventoryData";
import { useOrderFormTelemetry } from "@/lib/useOrderFormTelemetry";

type Field = "asset_id" | "quantity" | "supplier" | "unit_cost";
type FieldErrors = Partial<Record<Field, string>>;

// Textos por campo para los errores del cliente y los 422 de la API
const FIELD_TEXT: Record<Field, string> = {
  asset_id: "Elige un activo.",
  quantity: "Indica una cantidad entera mayor que 0.",
  supplier: "Indica el proveedor o vendedor.",
  unit_cost: "Indica el coste por unidad: un número mayor que 0, con hasta 2 decimales.",
};

export function InboundOrderForm() {
  const searchParams = useSearchParams();
  const { state, reload, refresh } = useInventoryData(listAssets);

  const [assetId, setAssetId] = useState(
    () => parseAssetId(searchParams.get("asset_id"))?.toString() ?? "",
  );
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const telemetry = useOrderFormTelemetry(
    "inbound_order",
    [assetId, quantity, supplier, unitCost].filter((v) => v.trim() !== "").length,
  );

  if (state.status === "loading") return <Loading>Cargando activos…</Loading>;
  if (state.status === "error") {
    return <ErrorBanner message={state.message} onRetry={reload} />;
  }

  const assets = state.data;
  const selected = assets.find((a) => String(a.id) === assetId) ?? null;

  async function handleSubmit() {
    setApiError(null);
    setSuccess(null);

    const qty = parseQuantity(quantity);
    const cost = parseUnitCost(unitCost);
    const found: FieldErrors = {};
    if (!selected) found.asset_id = FIELD_TEXT.asset_id;
    if (qty === null) found.quantity = FIELD_TEXT.quantity;
    if (!supplier.trim()) found.supplier = FIELD_TEXT.supplier;
    if (cost === null) found.unit_cost = FIELD_TEXT.unit_cost;
    setErrors(found);
    telemetry.validationFailed(Object.keys(found) as Field[]);
    if (!selected || qty === null || cost === null || Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const entry = await createAssetEntry({
        asset_id: selected.id,
        quantity: qty,
        supplier: supplier.trim(),
        office: selected.office,
        unit_cost: cost,
      });
      trackInboundCreated(selected, entry);
      telemetry.submitted();
      setSuccess(
        `Entrada registrada: ${qty} uds. de ${assetOptionLabel(selected)}, de ${supplier.trim()}.`,
      );
      setAssetId("");
      setQuantity("");
      setSupplier("");
      setUnitCost("");
      refresh();
    } catch (e) {
      if (e instanceof InventoryError) {
        trackInboundRejected(selected, e);
      }
      if (e instanceof InventoryError && e.status === 422) {
        const fromApi: FieldErrors = {};
        for (const field of Object.keys(e.fieldErrors)) {
          if (field in FIELD_TEXT) fromApi[field as Field] = FIELD_TEXT[field as Field];
        }
        setErrors(fromApi);
      }
      setApiError(inventoryErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {success && (
        <div role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {success}{" "}
          <Link href="/inventory/products" className="font-medium underline underline-offset-2">
            Ver el stock de activos
          </Link>
        </div>
      )}

      <form
        noValidate
        aria-busy={submitting}
        aria-labelledby="entrada-titulo"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <h2 id="entrada-titulo" className="text-sm font-semibold text-[#001D4A] sm:col-span-2">
          Datos de la entrega recibida
        </h2>

        <div className="sm:col-span-2">
          <AssetSelect
            assets={assets}
            value={selected ? assetId : ""}
            onChange={(value) => {
              setAssetId(value);
              telemetry.fieldChanged("asset_id");
            }}
            error={errors.asset_id}
          />
          {selected && (
            <p className="mt-1 text-xs text-slate-600" data-testid="inbound-current-stock">
              Stock actual: {selected.current_stock} uds.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="f-quantity" className={labelClass}>
            Cantidad recibida <span aria-hidden="true">*</span>
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
              telemetry.fieldChanged("quantity");
            }}
            aria-invalid={!!errors.quantity}
            aria-describedby={errors.quantity ? "f-quantity-error" : undefined}
            className={inputClass}
          />
          {errors.quantity && (
            <p id="f-quantity-error" role="alert" className={errorClass}>
              {errors.quantity}
            </p>
          )}
        </div>

        <OfficeField office={selected?.office ?? null} label="Oficina receptora" />

        <div>
          <label htmlFor="f-unit-cost" className={labelClass}>
            Coste unitario{selected ? ` (${CURRENCY_BY_OFFICE[selected.office]})` : ""}{" "}
            <span aria-hidden="true">*</span>
          </label>
          <input
            id="f-unit-cost"
            type="text"
            inputMode="decimal"
            placeholder="p. ej. 12,50"
            value={unitCost}
            onChange={(e) => {
              setUnitCost(e.target.value);
              telemetry.fieldChanged("unit_cost");
            }}
            aria-invalid={!!errors.unit_cost}
            aria-describedby={errors.unit_cost ? "f-unit-cost-error" : "f-unit-cost-help"}
            className={inputClass}
          />
          {errors.unit_cost ? (
            <p id="f-unit-cost-error" role="alert" className={errorClass}>
              {errors.unit_cost}
            </p>
          ) : (
            <p id="f-unit-cost-help" className="mt-1 text-xs text-slate-500">
              En la moneda de la oficina: EUR en Valencia, USD en Miami.
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="f-supplier" className={labelClass}>
            Proveedor <span aria-hidden="true">*</span>
          </label>
          <input
            id="f-supplier"
            type="text"
            maxLength={200}
            placeholder="p. ej. TechDistrib Valencia S.L."
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              telemetry.fieldChanged("supplier");
            }}
            aria-invalid={!!errors.supplier}
            aria-describedby={errors.supplier ? "f-supplier-error" : undefined}
            className={inputClass}
          />
          {errors.supplier && (
            <p id="f-supplier-error" role="alert" className={errorClass}>
              {errors.supplier}
            </p>
          )}
        </div>

        {apiError && (
          <p
            role="alert"
            data-testid="form-error"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2"
          >
            No se pudo registrar la entrada: {apiError}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-[#ECA400] px-4 py-2 text-sm font-semibold text-[#001D4A] hover:bg-[#d69500] disabled:opacity-50"
          >
            {submitting ? "Registrando…" : "Registrar entrada"}
          </button>
        </div>
      </form>
    </div>
  );
}
