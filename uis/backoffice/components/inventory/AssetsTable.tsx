"use client";

import Link from "next/link";

import { Empty, ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import { StockBadge } from "@/components/inventory/StockBadge";
import { CATEGORY_LABELS, LOW_STOCK_MAX, WARNING_STOCK_MAX, listAssets } from "@/lib/inventory";
import { useInventoryData } from "@/lib/useInventoryData";

const linkClass =
  "rounded-md border px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden";

export function AssetsTable() {
  const { state, reload } = useInventoryData(listAssets);

  if (state.status === "loading") return <Loading>Cargando activos…</Loading>;
  if (state.status === "error") return <ErrorBanner message={state.message} onRetry={reload} />;

  const assets = state.data;
  if (assets.length === 0) {
    return (
      <Empty>
        Todavía no hay activos registrados. Cuando se den de alta aparecerán aquí con su
        stock.
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600" aria-live="polite">
        {assets.length} activos · Nivel de stock: <strong>Stock bajo</strong> hasta{" "}
        {LOW_STOCK_MAX} uds., <strong>Stock justo</strong> hasta {WARNING_STOCK_MAX} uds. y{" "}
        <strong>Stock correcto</strong> por encima.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Activos de inventario con su stock actual</caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Activo</th>
              <th scope="col" className="px-4 py-3">SKU</th>
              <th scope="col" className="px-4 py-3">Categoría</th>
              <th scope="col" className="px-4 py-3">Oficina</th>
              <th scope="col" className="px-4 py-3 text-right">Stock actual</th>
              <th scope="col" className="px-4 py-3">Nivel</th>
              <th scope="col" className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((asset) => (
              <tr key={asset.id} data-testid="asset-row" data-sku={asset.sku}>
                <td className="px-4 py-3 font-medium text-[#001D4A]">{asset.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{asset.sku}</td>
                <td className="px-4 py-3 text-slate-700">{CATEGORY_LABELS[asset.category]}</td>
                <td className="px-4 py-3 text-slate-700">{asset.office}</td>
                <td
                  className="px-4 py-3 text-right font-semibold tabular-nums"
                  data-testid="current-stock"
                >
                  {asset.current_stock}
                </td>
                <td className="px-4 py-3">
                  <StockBadge stock={asset.current_stock} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/inventory/orders/inbound?asset_id=${asset.id}`}
                      aria-label={`Registrar entrada de ${asset.name} (${asset.sku})`}
                      className={`${linkClass} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}
                    >
                      + Entrada
                    </Link>
                    <Link
                      href={`/inventory/orders/outbound?asset_id=${asset.id}`}
                      aria-label={`Registrar salida de ${asset.name} (${asset.sku})`}
                      className={`${linkClass} border-sky-300 text-sky-800 hover:bg-sky-50`}
                    >
                      − Salida
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
