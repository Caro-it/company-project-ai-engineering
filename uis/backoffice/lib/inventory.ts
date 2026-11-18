// Cliente de la API de inventario (services/api/app/routers/inventory.py, ticket NXV-0201).
// ÚNICO punto del backoffice que llama a /inventory: los componentes nunca usan fetch.
// Fuente de verdad del dominio y del vocabulario: docs/CONTEXT-inventory-nexova.md
//
// Sesión: reutiliza apiFetch (lib/api.ts), que añade "Authorization: Bearer <nexova_token>"
// y manda a /login ante un 401.
//
// Errores: siempre un InventoryError (subclase de ApiError de lib/account).
// - 4xx salvo 401 y 422 (400 de negocio como el stock insuficiente, 404, 409…): se muestra
//   el detail de la API si es un texto no vacío, porque /inventory lo redacta para el
//   usuario. Es una excepción, limitada al inventario, a la política del backoffice de no
//   mostrar el detail. Sin detail de texto (o sin JSON): texto fijo de statusErrorMessage.
// - 422: qué campos fallaron (fieldErrors) y, si es un error de modelo, su motivo; nunca
//   el texto de Pydantic.
// - 401, 5xx, red y timeout: siempre el texto fijo de statusErrorMessage (el detail de un
//   5xx puede ser técnico).
import {
  API_URL,
  GENERIC_ERROR,
  apiFetch,
  failedRequestStatus,
  statusErrorMessage,
} from "@/lib/api";
import { ApiError, toApiError } from "@/lib/account";
import type {
  Asset,
  AssetCategory,
  AssetEntry,
  AssetEntryCreate,
  AssetExit,
  AssetExitCreate,
  ExitType,
  Order,
  OrderType,
} from "@/types/inventory";

// URL base de la API de inventario (README del Hito 5). Si no se define, la misma API
// que el resto del backoffice. La barra final se normaliza aquí, en un solo sitio.
export const INVENTORY_API_URL = (
  process.env.NEXT_PUBLIC_INVENTORY_API_URL || API_URL
).replace(/\/+$/, "");

// --- Etiquetas de interfaz (vocabulario del BRIEFING de Nexova) ------------------------

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  hardware: "Hardware",
  peripherals: "Periféricos",
  office_supplies: "Material de oficina",
  training_materials: "Material de formación",
};

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  allocation: "Asignación a empleado",
  consumption: "Consumo",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  inbound: "Entrada",
  outbound: "Salida",
};

// --- Nivel de stock ------------------------------------------------------------------
// Umbrales (decisión propia; el BRIEFING no los fija):
//   current_stock <= 5   → "low"     (rojo: "Agotado" si es 0, "Stock bajo" si no)
//   current_stock <= 15  → "warning" (ámbar: "Stock justo")
//   current_stock > 15   → "ok"      (verde: "Stock correcto")
export const LOW_STOCK_MAX = 5;
export const WARNING_STOCK_MAX = 15;

export type StockLevel = "low" | "warning" | "ok";

export function stockLevel(stock: number): StockLevel {
  if (stock <= LOW_STOCK_MAX) return "low";
  if (stock <= WARNING_STOCK_MAX) return "warning";
  return "ok";
}

export function stockLevelLabel(stock: number): string {
  if (stock <= 0) return "Agotado";
  const level = stockLevel(stock);
  if (level === "low") return "Stock bajo";
  if (level === "warning") return "Stock justo";
  return "Stock correcto";
}

// --- Errores -------------------------------------------------------------------------

export const INSUFFICIENT_STOCK_PREFIX = "Insufficient stock";

export class InventoryError extends ApiError {
  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    // detail de texto de un 4xx de la API (stock insuficiente, oficina, 404, 409…)
    readonly detail: string | null = null,
  ) {
    super(message, status, fieldErrors);
  }

  get isInsufficientStock(): boolean {
    return this.status === 400 && !!this.detail?.startsWith(INSUFFICIENT_STOCK_PREFIX);
  }
}

// Etiquetas de los campos del 422 en los formularios de órdenes
const FIELD_LABELS: Record<string, string> = {
  asset_id: "Activo",
  quantity: "Cantidad",
  supplier: "Proveedor",
  office: "Oficina",
  exit_type: "Tipo de salida",
  assigned_to: "Asignado a",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

// 422 de un model_validator (loc solo "body"): la regla de assigned_to del BRIEFING
const MODEL_ERROR_TEXT =
  "Revisa «Asignado a»: es obligatorio en una asignación y debe quedar vacío en un consumo.";

// 4xx cuyo detail de texto se enseña tal cual (ver la cabecera del archivo)
function showsApiDetail(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 422;
}

export async function toInventoryError(res: Response): Promise<InventoryError> {
  const base = await toApiError(res.clone());
  let detail: unknown = null;
  try {
    detail = (await res.json())?.detail ?? null;
  } catch {
    // sin JSON: basta con el status
  }

  if (showsApiDetail(res.status) && typeof detail === "string" && detail.trim()) {
    return new InventoryError(detail, res.status, {}, detail);
  }
  if (res.status === 422) {
    const fields = Object.keys(base.fieldErrors);
    const message =
      fields.length > 0
        ? `Revisa estos campos: ${fields.map(fieldLabel).join(", ")}.`
        : Array.isArray(detail) && detail.length > 0
          ? MODEL_ERROR_TEXT
          : base.message;
    return new InventoryError(message, 422, base.fieldErrors);
  }
  return new InventoryError(base.message, res.status, base.fieldErrors);
}

// Texto para la interfaz de cualquier error capturado
export function inventoryErrorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : GENERIC_ERROR;
}

// --- Peticiones ----------------------------------------------------------------------

const JSON_HEADERS = { "Content-Type": "application/json" };

async function inventoryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init, INVENTORY_API_URL);
  } catch (e) {
    const status = failedRequestStatus(e);
    throw new InventoryError(statusErrorMessage(status), status);
  }
  if (!res.ok) throw await toInventoryError(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new InventoryError("Respuesta inesperada del servidor. Inténtalo de nuevo.", res.status);
  }
}

export function listAssets(): Promise<Asset[]> {
  return inventoryRequest<Asset[]>("/inventory/products");
}

export function getAsset(id: number): Promise<Asset> {
  return inventoryRequest<Asset>(`/inventory/products/${id}`);
}

export function createAssetEntry(data: AssetEntryCreate): Promise<AssetEntry> {
  return inventoryRequest<AssetEntry>("/inventory/orders/inbound", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function createAssetExit(data: AssetExitCreate): Promise<AssetExit> {
  return inventoryRequest<AssetExit>("/inventory/orders/outbound", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function listOrders(): Promise<Order[]> {
  return inventoryRequest<Order[]>("/inventory/orders");
}

// Etiqueta de un activo en los selectores: nombre, SKU y oficina (hay nombres repetidos
// entre oficinas, p. ej. el portátil de Valencia y el de Miami)
export function assetOptionLabel(asset: Pick<Asset, "name" | "sku" | "office">): string {
  return `${asset.name} · ${asset.sku} · ${asset.office}`;
}

// asset_id de la query (?asset_id=3) o null si no es un entero positivo
export function parseAssetId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

// Cantidad de una orden: entero mayor que 0, o null si no lo es
export function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}
