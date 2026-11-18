import { InboundOrderForm } from "@/components/inventory/InboundOrderForm";
import { Loading } from "@/components/inventory/LoadStatus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Entrada de activos — Nexova Solutions",
};

// InboundOrderForm usa useSearchParams (?asset_id=): sin Suspense, el build de producción falla
export default function InboundOrderPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inventory/products" className="text-sm text-[#006992] underline underline-offset-2">
        ← Volver al stock de activos
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#001D4A]">
        Entrada de activos
      </h1>
      <p className="mt-2 text-slate-600">
        Registra una compra o entrega de proveedor recibida por Nexova. La oficina receptora
        es la del activo.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Loading />}>
          <InboundOrderForm />
        </Suspense>
      </div>
    </div>
  );
}
