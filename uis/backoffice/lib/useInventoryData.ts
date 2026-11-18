"use client";

import { useEffect, useState } from "react";

import { getAsset, inventoryErrorMessage } from "@/lib/inventory";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

// Carga datos del inventario con estados de carga, error y reintento (mismo patrón que
// SuppliersDirectory). loader es una función de lib/inventory.ts: aquí no hay fetch.
// loader debe ser estable (una función importada, no una flecha creada en cada render).
export function useInventoryData<T>(loader: () => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: "error", message: inventoryErrorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [loader, reloadKey]);

  function reload() {
    setState({ status: "loading" });
    setReloadKey((k) => k + 1);
  }

  // Recarga sin pasar por "loading" (p. ej. refrescar el stock tras registrar una orden)
  function refresh() {
    setReloadKey((k) => k + 1);
  }

  return { state, reload, refresh };
}

export type StockState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stock: number };

// Stock actual de un activo, pedido a GET /inventory/products/{id} cada vez que cambia
// el activo (o refreshKey, p. ej. tras registrar una salida). Mientras llega: "loading".
export function useAssetStock(assetId: number | null, refreshKey = 0): StockState {
  const key = assetId === null ? null : `${assetId}:${refreshKey}`;
  const [result, setResult] = useState<
    { key: string; stock: number } | { key: string; error: string } | null
  >(null);

  useEffect(() => {
    if (assetId === null || key === null) return;
    let cancelled = false;
    getAsset(assetId)
      .then((asset) => {
        if (!cancelled) setResult({ key, stock: asset.current_stock });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key, error: inventoryErrorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, key]);

  if (key === null) return { status: "idle" };
  if (result === null || result.key !== key) return { status: "loading" };
  if ("error" in result) return { status: "error", message: result.error };
  return { status: "ready", stock: result.stock };
}
