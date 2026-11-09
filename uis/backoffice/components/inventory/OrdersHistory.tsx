"use client";

import { Empty, ErrorBanner, Loading } from "@/components/inventory/LoadStatus";
import { EXIT_TYPE_LABELS, ORDER_TYPE_LABELS, listOrders } from "@/lib/inventory";
import { useInventoryData } from "@/lib/useInventoryData";
import type { Order, OrderType } from "@/types/inventory";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

// Entrada en verde con flecha hacia abajo (llega al almacén); salida en azul hacia arriba
const TYPE_STYLES: Record<OrderType, { className: string; icon: string }> = {
  inbound: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: "↓" },
  outbound: { className: "bg-sky-50 text-sky-800 ring-sky-200", icon: "↑" },
};

// Detalle propio de cada tipo: proveedor en entradas; asignación o consumo en salidas
function orderDetail(order: Order): string {
  if (order.order_type === "inbound") return `Proveedor: ${order.supplier ?? "—"}`;
  if (order.exit_type === "allocation") {
    return `${EXIT_TYPE_LABELS.allocation}: ${order.assigned_to ?? "—"}`;
  }
  return order.exit_type ? EXIT_TYPE_LABELS[order.exit_type] : "—";
}

export function OrdersHistory() {
  const { state, reload } = useInventoryData(listOrders);

  if (state.status === "loading") return <Loading>Cargando órdenes…</Loading>;
  if (state.status === "error") return <ErrorBanner message={state.message} onRetry={reload} />;

  const orders = state.data;
  if (orders.length === 0) {
    return <Empty>Todavía no hay entradas ni salidas de activos registradas.</Empty>;
  }

  const inbound = orders.filter((o) => o.order_type === "inbound").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600" aria-live="polite">
        {orders.length} órdenes: {inbound} entradas y {orders.length - inbound} salidas, de
        la más reciente a la más antigua.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Historial de entradas y salidas de activos</caption>
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Tipo</th>
              <th scope="col" className="px-4 py-3">Activo</th>
              <th scope="col" className="px-4 py-3 text-right">Cantidad</th>
              <th scope="col" className="px-4 py-3">Oficina</th>
              <th scope="col" className="px-4 py-3">Detalle</th>
              <th scope="col" className="px-4 py-3">Fecha</th>
              <th scope="col" className="px-4 py-3">Registrada por (user_uuid)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => {
              const style = TYPE_STYLES[order.order_type];
              return (
                <tr
                  key={`${order.order_type}-${order.id}`}
                  data-testid="order-row"
                  data-order-type={order.order_type}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style.className}`}
                    >
                      <span aria-hidden="true">{style.icon}</span>
                      {ORDER_TYPE_LABELS[order.order_type]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#001D4A]">{order.asset.name}</span>
                    <span className="block font-mono text-xs text-slate-500">
                      {order.asset.sku}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {order.order_type === "inbound" ? "+" : "−"}
                    {order.quantity}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{order.office}</td>
                  <td className="px-4 py-3 text-slate-700">{orderDetail(order)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    <time dateTime={order.created_at}>{formatDate(order.created_at)}</time>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs break-all text-slate-600">
                    {order.user_uuid}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
