import { SuppliersDirectory } from "@/components/SuppliersDirectory";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Directorio de proveedores — Nexova Solutions",
};

export default function ProveedoresPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight text-[#001D4A]">
        Directorio de proveedores
      </h1>
      <p className="mt-2 max-w-3xl text-slate-600">
        Registro oficial y único de los servicios externos que contrata Nexova
        en Valencia y Miami. Los contratos que se renuevan en los próximos 60
        días aparecen destacados, y los proveedores suspendidos se conservan
        para mantener el historial de la relación comercial.
      </p>
      <div className="mt-6">
        <SuppliersDirectory />
      </div>
    </div>
  );
}
