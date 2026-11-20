"use client";

import Link from "next/link";
import { useState } from "react";

import { attemptDirectStockEdit, inventoryErrorMessage } from "@/lib/inventory";
import type { Asset } from "@/types/inventory";

// «Ajustar stock»: el stock solo cambia con órdenes trazables. Si alguien intenta fijarlo a
// mano, el backoffice manda la petición y la API la rechaza (405). El rechazo se registra
// como direct_stock_edit_rejected (métrica obligatoria del BRIEFING de telemetría) y se
// explica al usuario qué hacer en su lugar.
export function StockAdjustAttempt({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    const stock = Number(value);
    if (!/^\d+$/.test(value.trim())) {
      setMessage("Indica un número entero de unidades.");
      return;
    }
    setSending(true);
    try {
      await attemptDirectStockEdit(asset, stock);
    } catch (e) {
      setMessage(inventoryErrorMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage(null);
          setValue(String(asset.current_stock));
        }}
        aria-label={`Ajustar el stock de ${asset.name} (${asset.sku})`}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden"
      >
        Ajustar stock
      </button>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-2 w-full space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2"
    >
      <label htmlFor={`adjust-${asset.id}`} className="block text-xs font-medium text-slate-700">
        Nuevo stock de {asset.sku}
      </label>
      <div className="flex gap-2">
        <input
          id={`adjust-${asset.id}`}
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-[#001D4A] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {sending ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-slate-600 underline"
        >
          Cancelar
        </button>
      </div>
      {message && (
        <p role="alert" data-testid="direct-stock-edit-error" className="text-xs text-rose-800">
          {message}{" "}
          <Link href={`/inventory/orders/inbound?asset_id=${asset.id}`} className="underline">
            Registrar entrada
          </Link>{" "}
          ·{" "}
          <Link href={`/inventory/orders/outbound?asset_id=${asset.id}`} className="underline">
            Registrar salida
          </Link>
        </p>
      )}
    </form>
  );
}
