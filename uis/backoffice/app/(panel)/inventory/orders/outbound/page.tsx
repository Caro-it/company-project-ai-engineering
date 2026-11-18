import { Loading } from "@/components/inventory/LoadStatus";
import { OutboundOrderForm } from "@/components/inventory/OutboundOrderForm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Salida de activos — Nexova Solutions",
};

// OutboundOrderForm usa useSearchParams (?asset_id=): sin Suspense, el build de producción falla
export default function OutboundOrderPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inventory/products" className="text-sm text-[#006992] underline underline-offset-2">
        ← Volver al stock de activos
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#001D4A]">
        Salida de activos
      </h1>
      <p className="mt-2 text-slate-600">
        Registra la asignación de un activo a un empleado o un consumo (p. ej., papel). No se
        puede sacar más stock del disponible.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Loading />}>
          <OutboundOrderForm />
        </Suspense>
      </div>
    </div>
  );
}
