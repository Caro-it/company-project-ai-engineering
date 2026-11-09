import { OrdersHistory } from "@/components/inventory/OrdersHistory";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Historial de órdenes de inventario — Nexova Solutions",
};

export default function InventoryOrdersPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Historial de órdenes
      </h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Todas las entradas y salidas de activos, con el responsable que registró cada una.
        Es de solo lectura: las órdenes no se editan ni se borran.
      </p>
      <div className="mt-6">
        <OrdersHistory />
      </div>
    </div>
  );
}
