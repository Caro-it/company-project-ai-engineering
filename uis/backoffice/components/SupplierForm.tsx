"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { Supplier } from "@/lib/suppliers";

// Lazy loading: el formulario de alta (validación, 9 campos, mensajes de error) es el
// trozo más grande de /proveedores y la mayoría de visitas solo consultan el directorio.
// Se descarga la primera vez que se abre. Ver CACHING_REPORT.md.
const SupplierCreateForm = dynamic(
  () => import("@/components/SupplierCreateForm"),
  {
    loading: () => (
      <p role="status" className="mt-4 text-sm text-slate-600">
        Cargando formulario…
      </p>
    ),
  },
);

export function SupplierForm({
  onCreated,
}: {
  onCreated: (s: Supplier) => void;
}) {
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  function handleCreated(created: Supplier) {
    onCreated(created);
    setSuccess(`Proveedor "${created.name}" registrado correctamente.`);
  }

  return (
    <section
      aria-labelledby="alta-titulo"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="alta-titulo" className="text-sm font-semibold text-[#001D4A]">
          Registrar proveedor
        </h2>
        <button
          type="button"
          onClick={() => {
            setSuccess(null);
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-controls="form-alta"
          className="rounded-md bg-[#001D4A] px-3 py-2 text-sm font-medium text-white hover:bg-[#002a6b]"
        >
          {open ? "Cerrar formulario" : "+ Nuevo proveedor"}
        </button>
      </div>

      {success && (
        <p
          role="status"
          className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}

      {open && <SupplierCreateForm onCreated={handleCreated} />}
    </section>
  );
}
