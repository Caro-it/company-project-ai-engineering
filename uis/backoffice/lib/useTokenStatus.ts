"use client";

import { useSyncExternalStore } from "react";

import { isTokenValid } from "@/lib/auth";

// Cambios del token hechos en otra pestaña
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// null mientras no se ha podido leer localStorage (servidor e hidratación);
// después, si hay un token sin caducar.
export function useTokenStatus(): boolean | null {
  return useSyncExternalStore(subscribe, isTokenValid, () => null);
}
