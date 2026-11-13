import { AssetsTable } from "@/components/inventory/AssetsTable";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Stock de activos — Nexova Solutions",
};

export default function InventoryProductsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">Stock de activos</h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Equipos y materiales de las oficinas de Valencia y Miami. El stock actual es siempre
        el neto de las entradas menos las salidas de cada activo: no se edita a mano.
      </p>
      <p className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/inventory/orders/inbound" className="text-[#006992] underline underline-offset-2">
          Registrar entrada de activos
        </Link>
        <Link href="/inventory/orders/outbound" className="text-[#006992] underline underline-offset-2">
          Registrar salida de activos
        </Link>
        <Link href="/inventory/orders" className="text-[#006992] underline underline-offset-2">
          Historial de entradas y salidas
        </Link>
      </p>
      <div className="mt-6">
        <AssetsTable />
      </div>
    </div>
  );
}
