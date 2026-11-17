import type { ReactNode } from "react";

// Aviso de error de carga con botón "Reintentar". "inline" va dentro de una tarjeta
// (p. ej. el resumen); "block" ocupa el lugar de un listado completo.
export function RetryAlert({
  children,
  onRetry,
  variant = "block",
}: {
  children: ReactNode;
  onRetry: () => void;
  variant?: "inline" | "block";
}) {
  const box = variant === "inline" ? "mt-3 rounded-md p-3" : "rounded-lg p-4";
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 text-sm text-rose-800 ${box}`}
    >
      <span>{children}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-rose-700 px-3 py-1.5 font-medium text-white hover:bg-rose-800"
      >
        Reintentar
      </button>
    </div>
  );
}
