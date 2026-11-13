// Estados de carga, error y vacío de las vistas de inventario

import type { ReactNode } from "react";

export function Loading({ children = "Cargando…" }: { children?: string }) {
  return (
    <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
      {children}
    </p>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
      {children}
    </p>
  );
}
