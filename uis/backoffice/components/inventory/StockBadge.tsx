import { stockLevel, stockLevelLabel, type StockLevel } from "@/lib/inventory";

// Color + icono + texto: el nivel nunca depende solo del color (umbrales en lib/inventory.ts)
const STYLES: Record<StockLevel, { className: string; icon: string }> = {
  low: { className: "bg-rose-50 text-rose-800 ring-rose-200", icon: "●" },
  warning: { className: "bg-amber-50 text-amber-900 ring-amber-200", icon: "▲" },
  ok: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: "✓" },
};

export function StockBadge({ stock }: { stock: number }) {
  const level = stockLevel(stock);
  const { className, icon } = STYLES[level];
  return (
    <span
      data-testid="stock-level"
      data-level={level}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      {stockLevelLabel(stock)}
    </span>
  );
}
