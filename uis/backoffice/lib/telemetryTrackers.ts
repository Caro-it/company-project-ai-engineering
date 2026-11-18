// Traducción de lo que pasa en el backoffice a eventos del plan de telemetría.
// Todo acaba en track() (lib/telemetry.ts): aquí solo se eligen el event_type y las
// properties del allowlist, con el vocabulario del BRIEFING (office en minúsculas,
// product_category, programme_id, currency…).
//
// Los eventos de negocio se emiten solo con la respuesta 2xx de la API (la orden ya está
// guardada) y con los datos que devuelve la API (stock_after, min_stock, cost_baseline):
// el navegador no calcula el stock por su cuenta.
import { track } from "@/lib/telemetry";
import type { TelemetryEventProperties } from "@/lib/telemetryEvents.generated";
import type { Asset, AssetEntry, AssetExit, ExitType } from "@/types/inventory";

type Props<E extends keyof TelemetryEventProperties> = TelemetryEventProperties[E];
type OfficeSlug = Props<"inbound_order_created">["office"];

// Umbral de kit_cost_variance_detected (plan: 10 %, configurable)
export const COST_VARIANCE_THRESHOLD_PCT = 10;

const OFFICE_CURRENCY = { valencia: "EUR", miami: "USD" } as const;

export function officeSlug(office: string): OfficeSlug {
  return office.toLowerCase() === "miami" ? "miami" : "valencia";
}

// "TechDistrib Valencia S.L." → "techdistrib-valencia-sl"
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Ruta como plantilla: sin query ni hash y con los ids sustituidos por {id}
export function routeTemplate(path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  return (
    clean
      .split("/")
      .map((segment) =>
        /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) ? "{id}" : segment,
      )
      .join("/") || "/"
  );
}

// Campos mínimos del BRIEFING para los eventos de inventario
function productProps(asset: Asset, quantity: number) {
  const office = officeSlug(asset.office);
  return {
    office,
    product_id: String(asset.id),
    product_category: asset.product_category,
    programme_id: asset.programme_id,
    quantity,
    currency: OFFICE_CURRENCY[office],
  };
}

// --- Órdenes creadas ----------------------------------------------------------------------

export function trackInboundCreated(asset: Asset, entry: AssetEntry): void {
  const base = productProps(asset, entry.quantity);
  const unitCost = entry.unit_cost;
  if (unitCost !== null && unitCost !== undefined) {
    track("inbound_order_created", {
      ...base,
      currency: entry.currency ?? base.currency,
      order_id: String(entry.id),
      supplier_id: slugify(entry.supplier),
      unit_cost: unitCost,
      total_cost: Math.round(unitCost * entry.quantity * 100) / 100,
      stock_after: entry.stock_after ?? 0,
    });
  }

  const baseline = entry.cost_baseline;
  if (unitCost && baseline && baseline.unit_cost > 0) {
    const variance = ((unitCost - baseline.unit_cost) / baseline.unit_cost) * 100;
    if (Math.abs(variance) > COST_VARIANCE_THRESHOLD_PCT) {
      track("kit_cost_variance_detected", {
        ...base,
        currency: entry.currency ?? base.currency,
        order_id: String(entry.id),
        supplier_id: slugify(entry.supplier),
        unit_cost: unitCost,
        baseline_unit_cost: baseline.unit_cost,
        variance_pct: Math.round(variance * 10) / 10,
        threshold_pct: COST_VARIANCE_THRESHOLD_PCT,
        baseline_sample_size: baseline.sample_size,
      });
    }
  }
}

export function trackOutboundCreated(asset: Asset, exit: AssetExit): void {
  const base = productProps(asset, exit.quantity);
  const stockAfter = exit.stock_after;
  if (exit.recipient_type) {
    track("outbound_order_created", {
      ...base,
      order_id: String(exit.id),
      recipient_type: exit.recipient_type,
      exit_type: exit.exit_type,
      stock_after: stockAfter ?? 0,
    });
  }
  if (stockAfter === null || stockAfter === undefined) return;

  const stockBefore = stockAfter + exit.quantity;
  const minStock = exit.min_stock;
  // Solo al cruzar el umbral, no en cada salida mientras siga por debajo
  if (minStock !== null && minStock !== undefined && stockBefore >= minStock && stockAfter < minStock) {
    track("stock_threshold_triggered", {
      ...base,
      min_stock: minStock,
      stock_before: stockBefore,
      stock_after: stockAfter,
      trigger_order_id: String(exit.id),
    });
  }
  if (stockAfter === 0) {
    track("stock_depleted", {
      office: base.office,
      product_id: base.product_id,
      product_category: base.product_category,
      programme_id: base.programme_id,
      trigger_order_id: String(exit.id),
    });
  }
}

// --- Órdenes rechazadas por la API --------------------------------------------------------

interface RejectionInfo {
  status: number;
  fieldErrors: Record<string, string>;
  detail: string | null;
}

function isOfficeMismatch(detail: string | null): boolean {
  return !!detail && detail.includes("pertenece a la oficina");
}

function commonErrorCode(info: RejectionInfo) {
  if (info.status === 404) return "asset_not_found" as const;
  if (info.status === 400 && isOfficeMismatch(info.detail)) return "office_mismatch" as const;
  if (info.status === 422) {
    const fields = Object.keys(info.fieldErrors);
    if (fields.includes("quantity")) return "invalid_quantity" as const;
    if (fields.length > 0) return "missing_field" as const;
  }
  return null;
}

function rejectionStatus(status: number): 400 | 404 | 422 | null {
  return status === 400 || status === 404 || status === 422 ? status : null;
}

export function trackInboundRejected(asset: Asset | null, info: RejectionInfo): void {
  const status = rejectionStatus(info.status);
  if (status === null) return; // 401, 5xx, red: no son rechazos de la orden
  const fields = Object.keys(info.fieldErrors);
  const code = commonErrorCode(info) ?? (status === 422 ? "invalid_value" : "other");
  track("inbound_order_rejected", {
    ...(asset ? productPropsWithoutQty(asset) : {}),
    status_code: status,
    error_code: code,
    invalid_fields: fields.length > 0 ? fields : undefined,
  });
}

export function trackOutboundRejected(
  asset: Asset | null,
  quantity: number | null,
  exitType: ExitType | "",
  info: RejectionInfo,
): void {
  const status = rejectionStatus(info.status);
  if (status === null) return;
  let code: Props<"outbound_order_rejected">["error_code"];
  let available: number | undefined;
  const insufficient = info.detail?.startsWith("Insufficient stock");
  if (status === 400 && insufficient) {
    code = "insufficient_stock";
    const match = info.detail?.match(/Available:\s*(\d+)/);
    available = match ? Number(match[1]) : undefined;
  } else if (status === 422 && Object.keys(info.fieldErrors).length === 0) {
    // 422 del model_validator: la regla de assigned_to
    code = exitType === "consumption" ? "assigned_to_not_allowed" : "assigned_to_required";
  } else {
    code = commonErrorCode(info) ?? "other";
  }
  track("outbound_order_rejected", {
    ...(asset ? productPropsWithoutQty(asset) : {}),
    quantity: quantity ?? undefined,
    stock_available: available,
    status_code: status,
    error_code: code,
  });
}

function productPropsWithoutQty(asset: Asset) {
  return {
    office: officeSlug(asset.office),
    product_id: String(asset.id),
    product_category: asset.product_category,
    programme_id: asset.programme_id,
  };
}

// --- Intento de modificar el stock fuera de una orden -----------------------------------

const STOCK_FIELDS = ["current_stock", "stock", "quantity"] as const;
type StockField = (typeof STOCK_FIELDS)[number];

export function stockFieldsIn(body: unknown): StockField[] {
  if (!body || typeof body !== "object") return [];
  return STOCK_FIELDS.filter((field) => field in (body as Record<string, unknown>));
}

// Lo llama lib/inventory.ts cuando la API rechaza (405/422) una petición que intentaba fijar
// el stock: PUT/PATCH/DELETE sobre /inventory/products/{id}, o un body de producto con
// campos de stock
export function trackDirectStockEditRejected(args: {
  method: string;
  path: string;
  status: number;
  body: unknown;
  asset: Asset | null;
  userRole: UserRole;
}): void {
  const method = args.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") return;
  if (args.status !== 405 && args.status !== 422) return;
  const fields = stockFieldsIn(args.body);
  const quantityValue = fields.length > 0 ? (args.body as Record<string, unknown>)[fields[0]] : undefined;
  track("direct_stock_edit_rejected", {
    ...(args.asset ? productPropsWithoutQty(args.asset) : {}),
    currency: args.asset ? OFFICE_CURRENCY[officeSlug(args.asset.office)] : undefined,
    quantity: typeof quantityValue === "number" ? quantityValue : undefined,
    http_method: method as Props<"direct_stock_edit_rejected">["http_method"],
    route: routeTemplate(args.path),
    status_code: args.status,
    rejected_fields: fields.length > 0 ? fields : undefined,
    user_role: args.userRole,
  });
}

// --- Formularios de órdenes ---------------------------------------------------------------

export type OrderFormName = "inbound_order" | "outbound_order";
export type OrderFormField = Props<"order_form_validation_failed">["invalid_fields"][number];

export function trackOrderFormValidationFailed(form: OrderFormName, fields: OrderFormField[]): void {
  if (fields.length === 0) return;
  track("order_form_validation_failed", { form, invalid_fields: fields });
}

export function trackOrderFormAbandoned(props: Props<"order_form_abandoned">): void {
  track("order_form_abandoned", props);
}

// --- Autenticación ------------------------------------------------------------------------

export type UserRole = "admin" | "manager" | "user";
const ROLE_KEY = "nexova_telemetry_role";

// El rol se guarda al hacer login (GET /auth/me) para los eventos que lo llevan
export function rememberUserRole(role: UserRole): void {
  try {
    window.sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    // sin sessionStorage se volverá a pedir a /auth/me
  }
}

export function rememberedUserRole(): UserRole | null {
  try {
    const role = window.sessionStorage.getItem(ROLE_KEY);
    return role === "admin" || role === "manager" || role === "user" ? role : null;
  } catch {
    return null;
  }
}

// Formularios con cambios sin enviar (para session_expired.had_unsaved_form)
const dirtyForms = new Set<string>();

export function setFormDirty(formId: string, dirty: boolean): void {
  if (dirty) dirtyForms.add(formId);
  else dirtyForms.delete(formId);
}

export function trackSessionExpired(pathname: string): void {
  track("session_expired", {
    page: routeTemplate(pathname),
    had_unsaved_form: dirtyForms.size > 0,
  });
}

// api_request_failed: máximo 1 por ruta cada 30 s (plan §5.2)
const lastFailure = new Map<string, number>();
export const REQUEST_FAILED_THROTTLE_MS = 30_000;

export function trackApiRequestFailed(args: {
  method: string;
  path: string;
  failureType: "network" | "timeout" | "cors" | "aborted";
  elapsedMs: number;
}): void {
  const method = args.method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return;
  const route = routeTemplate(args.path);
  const key = `${method} ${route}`;
  const now = Date.now();
  if (now - (lastFailure.get(key) ?? -Infinity) < REQUEST_FAILED_THROTTLE_MS) return;
  lastFailure.set(key, now);
  track("api_request_failed", {
    route,
    http_method: method as Props<"api_request_failed">["http_method"],
    failure_type: args.failureType,
    elapsed_ms: Math.round(args.elapsedMs),
  });
}

export function loginFailureReason(status: number): Props<"login_failed">["reason"] {
  if (status === 401 || status === 400 || status === 422) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  if (status === 0 || status === 408) return "network_error";
  return "server_error";
}

export function trackLoginFailed(status: number): void {
  track("login_failed", { reason: loginFailureReason(status) });
}

export function trackLoginSucceeded(role: "admin" | "manager" | "user"): void {
  track("login_succeeded", { user_role: role });
}

// --- Otras secciones ----------------------------------------------------------------------

export function trackIncidentCreated(props: Props<"incident_created">): void {
  track("incident_created", props);
}

export function trackSupplierRateChanged(args: {
  supplierId: string;
  category?: string;
  currency: string;
  previous: number;
  next: number;
}): void {
  if (args.currency !== "EUR" && args.currency !== "USD") return;
  const change = args.previous > 0 ? ((args.next - args.previous) / args.previous) * 100 : 0;
  track("supplier_rate_changed", {
    supplier_id: args.supplierId,
    category: args.category,
    currency: args.currency,
    previous_monthly_rate: args.previous,
    new_monthly_rate: args.next,
    change_pct: Math.round(change * 10) / 10,
  });
}

// --- Errores de frontend ------------------------------------------------------------------

export const ERROR_DEDUPE_MS = 60_000;
export const MAX_ERRORS_PER_SESSION = 20;
const lastErrorAt = new Map<string, number>();
let errorsThisSession = 0;

// Mensaje saneado (plan §6): sin emails, sin números largos, sin query strings; máx. 200
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\?[^\s'"]*/g, "")
    .replace(/\d{6,}/g, "[n]")
    .slice(0, 200);
}

// Hash corto y estable (FNV-1a de 48 bits) para agrupar el mismo error
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 12);
}

function errorParts(error: unknown): { name: string; message: string; frame: string } {
  if (error instanceof Error) {
    const frame = (error.stack ?? "").split("\n").find((line) => line.trim().startsWith("at ")) ?? "";
    return { name: error.name || "Error", message: error.message, frame: frame.replace(/\?[^):]*/g, "") };
  }
  return { name: "NonErrorThrown", message: typeof error === "string" ? error : "", frame: "" };
}

export function trackFrontendError(
  error: unknown,
  source: "onerror" | "unhandledrejection" | "error_boundary",
  pathname: string,
): void {
  const { name, message, frame } = errorParts(error);
  const fp = fingerprint(`${name}|${frame || message}`);
  const now = Date.now();
  if (now - (lastErrorAt.get(fp) ?? -Infinity) < ERROR_DEDUPE_MS) return;
  if (errorsThisSession >= MAX_ERRORS_PER_SESSION) return;
  lastErrorAt.set(fp, now);
  errorsThisSession += 1;
  track("frontend_error_captured", {
    page: routeTemplate(pathname),
    app: "backoffice",
    error_name: name.slice(0, 60),
    message: sanitizeErrorMessage(message),
    source,
    fingerprint: fp,
    release: process.env.NEXT_PUBLIC_RELEASE || undefined,
  });
}

// --- Navegación y rendimiento ---------------------------------------------------------------

export function trackPageViewed(pathname: string, referrer: string | null): void {
  track("page_viewed", {
    page: routeTemplate(pathname),
    app: "backoffice",
    referrer_page: referrer ? routeTemplate(referrer) : undefined,
    ui_locale: typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "es",
  });
}

export function deviceType(width: number): "desktop" | "mobile" | "tablet" {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export interface PageVitals {
  lcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
}

export function trackPageLoad(pathname: string, vitals: PageVitals): void {
  if (Object.keys(vitals).length === 0) return;
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection?.effectiveType;
  track("page_load_recorded", {
    page: routeTemplate(pathname),
    app: "backoffice",
    ...vitals,
    device_type: deviceType(window.innerWidth),
    connection_type:
      connection === "slow-2g" || connection === "2g" || connection === "3g" || connection === "4g"
        ? connection
        : undefined,
  });
}
