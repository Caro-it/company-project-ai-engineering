// ARCHIVO GENERADO por scripts/generate-telemetry-events.mjs desde
// docs/telemetry/event-schemas.json. No lo edites a mano: cambia el JSON y ejecuta
// `npm run telemetry:generate`.

export const TELEMETRY_SCHEMA_VERSION = "1.0.0";

export interface TelemetryEventProperties {
  inbound_order_created: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    quantity: number;
    currency: "EUR" | "USD";
    order_id: string;
    supplier_id: string;
    unit_cost: number;
    total_cost: number;
    stock_after: number;
  };
  outbound_order_created: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    quantity: number;
    currency: "EUR" | "USD";
    order_id: string;
    recipient_type: "client" | "candidate" | "consultant" | "support_agent" | "employee";
    exit_type: "allocation" | "consumption";
    stock_after: number;
  };
  stock_threshold_triggered: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    quantity: number;
    currency: "EUR" | "USD";
    min_stock: number;
    stock_before: number;
    stock_after: number;
    trigger_order_id: string;
  };
  direct_stock_edit_rejected: {
    office?: "valencia" | "miami";
    product_id?: string;
    product_category?: "training_kit" | "certification" | "onboarding_equipment";
    programme_id?: string;
    quantity?: number;
    currency?: "EUR" | "USD";
    http_method: "POST" | "PUT" | "PATCH" | "DELETE";
    route: string;
    status_code: 405 | 422;
    rejected_fields?: ("current_stock" | "stock" | "quantity")[];
    user_role: "admin" | "manager" | "user";
  };
  kit_cost_variance_detected: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    quantity: number;
    currency: "EUR" | "USD";
    order_id: string;
    supplier_id: string;
    unit_cost: number;
    baseline_unit_cost: number;
    variance_pct: number;
    threshold_pct: number;
    baseline_sample_size: number;
  };
  inbound_order_rejected: {
    office?: "valencia" | "miami";
    product_id?: string;
    product_category?: "training_kit" | "certification" | "onboarding_equipment";
    programme_id?: string;
    status_code: 400 | 404 | 422;
    error_code: "asset_not_found" | "office_mismatch" | "invalid_quantity" | "missing_field" | "invalid_value" | "other";
    invalid_fields?: string[];
  };
  outbound_order_rejected: {
    office?: "valencia" | "miami";
    product_id?: string;
    product_category?: "training_kit" | "certification" | "onboarding_equipment";
    programme_id?: string;
    quantity?: number;
    stock_available?: number;
    status_code: 400 | 404 | 422;
    error_code: "insufficient_stock" | "asset_not_found" | "office_mismatch" | "assigned_to_required" | "assigned_to_not_allowed" | "invalid_quantity" | "missing_field" | "other";
  };
  stock_depleted: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    trigger_order_id: string;
  };
  product_created: {
    office: "valencia" | "miami";
    product_id: string;
    product_category: "training_kit" | "certification" | "onboarding_equipment";
    programme_id: string;
    min_stock: number;
  };
  product_create_rejected: {
    office?: "valencia" | "miami";
    product_category?: "training_kit" | "certification" | "onboarding_equipment";
    status_code: 409 | 422;
    error_code: "duplicate_sku" | "invalid_category" | "invalid_office" | "missing_field" | "other";
  };
  login_succeeded: {
    user_role: "admin" | "manager" | "user";
  };
  login_failed: {
    reason: "invalid_credentials" | "rate_limited" | "server_error" | "network_error";
  };
  session_expired: {
    page: string;
    had_unsaved_form: boolean;
  };
  password_reset_requested: {
    account_exists: boolean;
    account_ref: string;
  };
  password_reset_completed: {
    token_age_minutes: number;
  };
  password_reset_failed: {
    reason: "token_not_found" | "token_expired" | "token_used" | "user_inactive" | "weak_password";
  };
  permission_denied: {
    route: string;
    http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    user_role: "admin" | "manager" | "user";
  };
  user_role_changed: {
    target_user_id: string;
    previous_role: "admin" | "manager" | "user";
    new_role: "admin" | "manager" | "user";
    is_active: boolean;
  };
  api_latency_recorded: {
    route: string;
    http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    window_seconds: 60;
    request_count: number;
    p50_ms: number;
    p95_ms: number;
    max_ms: number;
    error_count: number;
    cache_hit_ratio?: number;
  };
  page_load_recorded: {
    page: string;
    app: "backoffice" | "website";
    lcp_ms?: number;
    inp_ms?: number;
    cls?: number;
    ttfb_ms?: number;
    device_type: "desktop" | "mobile" | "tablet";
    connection_type?: "slow-2g" | "2g" | "3g" | "4g";
  };
  cache_stats_recorded: {
    cache_name: "incidents_summary" | "inventory_products";
    hits: number;
    misses: number;
    entries: number;
    ttl_seconds: number;
  };
  order_form_validation_failed: {
    form: "inbound_order" | "outbound_order";
    invalid_fields: ("asset_id" | "quantity" | "supplier" | "unit_cost" | "exit_type" | "assigned_to" | "recipient_type" | "office")[];
  };
  api_error_occurred: {
    route: string;
    http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    status_code: number;
    error_class: string;
    fingerprint: string;
  };
  frontend_error_captured: {
    page: string;
    app: "backoffice" | "website";
    error_name: string;
    message: string;
    source: "onerror" | "unhandledrejection" | "error_boundary";
    fingerprint: string;
    release?: string;
  };
  api_request_failed: {
    route: string;
    http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    failure_type: "network" | "timeout" | "cors" | "aborted";
    elapsed_ms: number;
  };
  inventory_filter_applied: {
    page: string;
    filter_office?: "valencia" | "miami";
    filter_category?: "training_kit" | "certification" | "onboarding_equipment";
    results_count: number;
  };
  order_form_abandoned: {
    form: "inbound_order" | "outbound_order";
    last_field?: "asset_id" | "quantity" | "supplier" | "unit_cost" | "exit_type" | "assigned_to" | "recipient_type" | "office";
    fields_completed: number;
    had_validation_error: boolean;
    time_on_form_ms: number;
  };
  page_viewed: {
    page: string;
    app: "backoffice" | "website";
    referrer_page?: string;
    ui_locale: "es" | "en";
  };
  incident_created: {
    category: "technical_failure" | "process_error" | "client_complaint" | "candidate_issue" | "staff_issue" | "sla_breach" | "data_quality" | "other";
    origin: "customer" | "branch" | "internal";
    branch: "central" | "valencia_operations" | "miami_office" | "remote";
  };
  incident_status_changed: {
    incident_id: string;
    from_status: "open" | "in_progress" | "resolved" | "discarded";
    to_status: "open" | "in_progress" | "resolved" | "discarded";
    category: "technical_failure" | "process_error" | "client_complaint" | "candidate_issue" | "staff_issue" | "sla_breach" | "data_quality" | "other";
    minutes_in_previous_status: number;
  };
  incident_file_analyzed: {
    rows_total: number;
    rows_invalid: number;
    invalid_rules?: string[];
    file_size_kb: number;
  };
  supplier_rate_changed: {
    supplier_id: string;
    category?: string;
    currency: "EUR" | "USD";
    previous_monthly_rate: number;
    new_monthly_rate: number;
    change_pct: number;
  };
}

export type TelemetryEventType = keyof TelemetryEventProperties;

// Allowlist por evento: track() descarta cualquier clave que no esté en `allowed`
export const TELEMETRY_EVENT_KEYS: Record<TelemetryEventType, { allowed: readonly string[]; required: readonly string[] }> = {
  inbound_order_created: { allowed: ["office","product_id","product_category","programme_id","quantity","currency","order_id","supplier_id","unit_cost","total_cost","stock_after"], required: ["office","product_id","product_category","programme_id","quantity","currency","order_id","supplier_id","unit_cost","total_cost","stock_after"] },
  outbound_order_created: { allowed: ["office","product_id","product_category","programme_id","quantity","currency","order_id","recipient_type","exit_type","stock_after"], required: ["office","product_id","product_category","programme_id","quantity","currency","order_id","recipient_type","exit_type","stock_after"] },
  stock_threshold_triggered: { allowed: ["office","product_id","product_category","programme_id","quantity","currency","min_stock","stock_before","stock_after","trigger_order_id"], required: ["office","product_id","product_category","programme_id","quantity","currency","min_stock","stock_before","stock_after","trigger_order_id"] },
  direct_stock_edit_rejected: { allowed: ["office","product_id","product_category","programme_id","quantity","currency","http_method","route","status_code","rejected_fields","user_role"], required: ["http_method","route","status_code","user_role"] },
  kit_cost_variance_detected: { allowed: ["office","product_id","product_category","programme_id","quantity","currency","order_id","supplier_id","unit_cost","baseline_unit_cost","variance_pct","threshold_pct","baseline_sample_size"], required: ["office","product_id","product_category","programme_id","quantity","currency","order_id","supplier_id","unit_cost","baseline_unit_cost","variance_pct","threshold_pct","baseline_sample_size"] },
  inbound_order_rejected: { allowed: ["office","product_id","product_category","programme_id","status_code","error_code","invalid_fields"], required: ["status_code","error_code"] },
  outbound_order_rejected: { allowed: ["office","product_id","product_category","programme_id","quantity","stock_available","status_code","error_code"], required: ["status_code","error_code"] },
  stock_depleted: { allowed: ["office","product_id","product_category","programme_id","trigger_order_id"], required: ["office","product_id","product_category","programme_id","trigger_order_id"] },
  product_created: { allowed: ["office","product_id","product_category","programme_id","min_stock"], required: ["office","product_id","product_category","programme_id","min_stock"] },
  product_create_rejected: { allowed: ["office","product_category","status_code","error_code"], required: ["status_code","error_code"] },
  login_succeeded: { allowed: ["user_role"], required: ["user_role"] },
  login_failed: { allowed: ["reason"], required: ["reason"] },
  session_expired: { allowed: ["page","had_unsaved_form"], required: ["page","had_unsaved_form"] },
  password_reset_requested: { allowed: ["account_exists","account_ref"], required: ["account_exists","account_ref"] },
  password_reset_completed: { allowed: ["token_age_minutes"], required: ["token_age_minutes"] },
  password_reset_failed: { allowed: ["reason"], required: ["reason"] },
  permission_denied: { allowed: ["route","http_method","user_role"], required: ["route","http_method","user_role"] },
  user_role_changed: { allowed: ["target_user_id","previous_role","new_role","is_active"], required: ["target_user_id","previous_role","new_role","is_active"] },
  api_latency_recorded: { allowed: ["route","http_method","window_seconds","request_count","p50_ms","p95_ms","max_ms","error_count","cache_hit_ratio"], required: ["route","http_method","window_seconds","request_count","p50_ms","p95_ms","max_ms","error_count"] },
  page_load_recorded: { allowed: ["page","app","lcp_ms","inp_ms","cls","ttfb_ms","device_type","connection_type"], required: ["page","app","device_type"] },
  cache_stats_recorded: { allowed: ["cache_name","hits","misses","entries","ttl_seconds"], required: ["cache_name","hits","misses","entries","ttl_seconds"] },
  order_form_validation_failed: { allowed: ["form","invalid_fields"], required: ["form","invalid_fields"] },
  api_error_occurred: { allowed: ["route","http_method","status_code","error_class","fingerprint"], required: ["route","http_method","status_code","error_class","fingerprint"] },
  frontend_error_captured: { allowed: ["page","app","error_name","message","source","fingerprint","release"], required: ["page","app","error_name","message","source","fingerprint"] },
  api_request_failed: { allowed: ["route","http_method","failure_type","elapsed_ms"], required: ["route","http_method","failure_type","elapsed_ms"] },
  inventory_filter_applied: { allowed: ["page","filter_office","filter_category","results_count"], required: ["page","results_count"] },
  order_form_abandoned: { allowed: ["form","last_field","fields_completed","had_validation_error","time_on_form_ms"], required: ["form","fields_completed","had_validation_error","time_on_form_ms"] },
  page_viewed: { allowed: ["page","app","referrer_page","ui_locale"], required: ["page","app","ui_locale"] },
  incident_created: { allowed: ["category","origin","branch"], required: ["category","origin","branch"] },
  incident_status_changed: { allowed: ["incident_id","from_status","to_status","category","minutes_in_previous_status"], required: ["incident_id","from_status","to_status","category","minutes_in_previous_status"] },
  incident_file_analyzed: { allowed: ["rows_total","rows_invalid","invalid_rules","file_size_kb"], required: ["rows_total","rows_invalid","file_size_kb"] },
  supplier_rate_changed: { allowed: ["supplier_id","category","currency","previous_monthly_rate","new_monthly_rate","change_pct"], required: ["supplier_id","currency","previous_monthly_rate","new_monthly_rate","change_pct"] },
};
