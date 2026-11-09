// Tipos del inventario de Nexova (ticket NXV-0201).
// Reflejan services/api/app/schemas.py y app/inventory_catalog.py: si cambian allí, cambian aquí.
// Fuente de verdad del dominio: docs/CONTEXT-inventory-nexova.md

export const ASSET_CATEGORIES = [
  "hardware",
  "peripherals",
  "office_supplies",
  "training_materials",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const OFFICES = ["Valencia", "Miami"] as const;
export type Office = (typeof OFFICES)[number];

export const EXIT_TYPES = ["allocation", "consumption"] as const;
export type ExitType = (typeof EXIT_TYPES)[number];

export type OrderType = "inbound" | "outbound";

// AssetRead: activo con su stock calculado (nunca almacenado)
export interface Asset {
  id: number;
  name: string;
  sku: string;
  category: AssetCategory;
  office: Office;
  current_stock: number;
}

// AssetSummary: datos del activo que acompañan a cada orden del historial
export type AssetSummary = Omit<Asset, "current_stock">;

// AssetEntryCreate: body de POST /inventory/orders/inbound (user_uuid sale del token)
export interface AssetEntryCreate {
  asset_id: number;
  quantity: number;
  supplier: string;
  office: Office;
}

export interface AssetEntry extends AssetEntryCreate {
  id: number;
  created_at: string;
  user_uuid: string;
}

// AssetExitCreate: body de POST /inventory/orders/outbound.
// assigned_to obligatorio con "allocation" y null con "consumption" (regla 3 del BRIEFING).
export interface AssetExitCreate {
  asset_id: number;
  quantity: number;
  exit_type: ExitType;
  assigned_to: string | null;
  office: Office;
}

export interface AssetExit extends AssetExitCreate {
  id: number;
  created_at: string;
  user_uuid: string;
}

// OrderRead: una fila de GET /inventory/orders (entrada o salida)
export interface Order {
  order_type: OrderType;
  id: number;
  asset: AssetSummary;
  quantity: number;
  office: Office;
  created_at: string;
  user_uuid: string;
  supplier: string | null;
  exit_type: ExitType | null;
  assigned_to: string | null;
}
