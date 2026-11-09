import { assetOptionLabel } from "@/lib/inventory";
import type { Asset } from "@/types/inventory";

export const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm aria-[invalid=true]:border-rose-500";
export const errorClass = "mt-1 text-xs text-rose-700";
export const labelClass = "text-sm text-slate-700";

// Ids de aria-describedby que existen (los vacíos se descartan)
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const list = ids.filter(Boolean);
  return list.length > 0 ? list.join(" ") : undefined;
}

// Selector de activo por nombre (nunca un id en bruto). Incluye SKU y oficina porque
// hay nombres repetidos entre oficinas.
export function AssetSelect({
  assets,
  value,
  onChange,
  error,
}: {
  assets: Asset[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor="f-asset" className={labelClass}>
        Activo <span aria-hidden="true">*</span>
      </label>
      <select
        id="f-asset"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? "f-asset-error" : undefined}
        className={inputClass}
      >
        <option value="">Elige un activo</option>
        {assets.map((asset) => (
          <option key={asset.id} value={String(asset.id)}>
            {assetOptionLabel(asset)}
          </option>
        ))}
      </select>
      {error && (
        <p id="f-asset-error" role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </div>
  );
}

// Oficina de la orden: siempre la del activo (la API rechaza otra), así que no se elige
export function OfficeField({ office, label }: { office: string | null; label: string }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p
        data-testid="order-office"
        className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
      >
        {office ?? "Se toma de la oficina del activo"}
      </p>
    </div>
  );
}
