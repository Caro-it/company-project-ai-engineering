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

// Telemetría (docs/telemetry/telemetry-plan.md §1.3): categoría del material según el
// BRIEFING de telemetría, independiente de AssetCategory
export const PRODUCT_CATEGORIES = ["training_kit", "certification", "onboarding_equipment"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

// A quién se entrega una salida, como tipo (nunca el nombre: eso es assigned_to)
export const RECIPIENT_TYPES = [
  "client",
  "candidate",
  "consultant",
  "support_agent",
  "employee",
] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export type Currency = "EUR" | "USD";

// AssetRead: activo con su stock calculado (nunca almacenado)
export interface Asset {
  id: number;
  name: string;
  sku: string;
  category: AssetCategory;
  office: Office;
  programme_id: string;
  product_category: ProductCategory;
  min_stock: number;
  current_stock: number;
}

// AssetSummary: datos del activo que acompañan a cada orden del historial
export type AssetSummary = Omit<Asset, "current_stock" | "min_stock">;

// AssetEntryCreate: body de POST /inventory/orders/inbound (user_uuid sale del token)
export interface AssetEntryCreate {
  asset_id: number;
  quantity: number;
  supplier: string;
  office: Office;
  // Coste unitario en la moneda de la oficina; la moneda la pone la API
  unit_cost: number | null;
}

export interface CostBaseline {
  unit_cost: number;
  sample_size: number;
}

export interface AssetEntry extends AssetEntryCreate {
  id: number;
  created_at: string;
  user_uuid: string;
  currency: Currency | null;
  // Solo en la respuesta del POST: stock tras la entrada y media de coste previa
  stock_after?: number | null;
  cost_baseline?: CostBaseline | null;
}

// AssetExitCreate: body de POST /inventory/orders/outbound.
// assigned_to obligatorio con "allocation" y null con "consumption" (regla 3 del BRIEFING).
export interface AssetExitCreate {
  asset_id: number;
  quantity: number;
  exit_type: ExitType;
  assigned_to: string | null;
  office: Office;
  recipient_type: RecipientType | null;
}

export interface AssetExit extends AssetExitCreate {
  id: number;
  created_at: string;
  user_uuid: string;
  // Solo en la respuesta del POST: stock tras la salida y umbral del activo
  stock_after?: number | null;
  min_stock?: number | null;
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
  unit_cost?: number | null;
  currency?: Currency | null;
  exit_type: ExitType | null;
  assigned_to: string | null;
  recipient_type?: RecipientType | null;
}
