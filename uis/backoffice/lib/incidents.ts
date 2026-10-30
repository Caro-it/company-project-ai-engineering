// Cliente de la API de incidencias (services/api): analizador de CSV y gestor de incidencias.
import {
  GENERIC_ERROR,
  apiFetch,
  failedRequestStatus,
  statusErrorMessage,
} from "@/lib/api";

// --- Analizador de CSV: los tipos reflejan el JSON de analyze_rows ---

export interface IncidentsSummary {
  total_records: number;
  valid_records: number;
  invalid_records: number;
  invalid_by_rule: Record<string, number>;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  satisfaction: {
    closed: number;
    scored: number;
    average: number;
    distribution: Record<string, number>;
  };
}

export interface AnalyzeResponse {
  filename: string;
  summary: IncidentsSummary;
  invalid_rule_labels: Record<string, string>;
}

// Textos fijos del analizador por status (los detail de la API no se muestran)
const ANALYZE_ERRORS: Record<number, string> = {
  400: "El fichero está vacío o no está codificado en UTF-8.",
  404: "Todavía no hay ningún análisis. Sube un CSV primero.",
  413: "El fichero supera el tamaño máximo de 50 MB.",
  415: "El fichero debe tener extensión .csv.",
  422: "El contenido del CSV no es válido. Revisa las columnas y el formato del fichero.",
};

export class AnalyzerError extends Error {
  constructor(readonly status: number) {
    super(ANALYZE_ERRORS[status] ?? statusErrorMessage(status));
    this.name = "AnalyzerError";
  }
}

export function analyzerErrorMessage(e: unknown): string {
  return e instanceof AnalyzerError ? e.message : GENERIC_ERROR;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    throw new AnalyzerError(failedRequestStatus(e));
  }
  if (!res.ok) throw new AnalyzerError(res.status);
  return res;
}

export async function analyzeIncidents(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await request("/api/incidents/analyze", {
    method: "POST",
    body: form,
  });
  try {
    return await res.json();
  } catch {
    throw new AnalyzerError(-1);
  }
}

export async function downloadResults(): Promise<void> {
  const res = await request("/api/incidents/results/export");
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    throw new AnalyzerError(-1);
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "results.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Gestor de incidencias (services/api/app/routers/incidents.py) ---
// Fuente de verdad de valores: docs/CONTEXT-incident-manager-nexova.md.
// Copia de incidents_core/incident_model.py (el backoffice no puede importar Python):
// si cambia allí, hay que cambiarlo aquí.

export const STATUSES = ["open", "in_progress", "resolved", "discarded"] as const;
export type IncidentStatus = (typeof STATUSES)[number];

export const ORIGINS = ["customer", "branch", "internal"] as const;
export type IncidentOrigin = (typeof ORIGINS)[number];

export const CATEGORIES = [
  "technical_failure",
  "process_error",
  "client_complaint",
  "candidate_issue",
  "staff_issue",
  "sla_breach",
  "data_quality",
  "other",
] as const;
export type IncidentCategory = (typeof CATEGORIES)[number];

export const BRANCHES = [
  "central",
  "valencia_operations",
  "miami_office",
  "remote",
] as const;
export type IncidentBranch = (typeof BRANCHES)[number];

// resolved y discarded son estados finales
export const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "discarded"],
  in_progress: ["resolved", "discarded"],
  resolved: [],
  discarded: [],
};

// Nombres para mostrar de las sedes: literales del CONTEXT, no se traducen ni se acortan
export const BRANCH_LABELS: Record<IncidentBranch, string> = {
  central: "Central — Sede Valencia",
  valencia_operations: "Valencia — Operaciones",
  miami_office: "Miami Office",
  remote: "Remoto (empleado sin sede fija)",
};

// Textos de interfaz. Los valores que se envían a la API son siempre los del CONTEXT.
export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Abierta",
  in_progress: "En curso",
  resolved: "Resuelta",
  discarded: "Descartada",
};

export const ORIGIN_LABELS: Record<IncidentOrigin, string> = {
  customer: "Cliente",
  branch: "Sede",
  internal: "Interna",
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  technical_failure: "Fallo técnico",
  process_error: "Error de proceso",
  client_complaint: "Queja de cliente",
  candidate_issue: "Incidencia de candidato",
  staff_issue: "Incidencia de personal",
  sla_breach: "Incumplimiento de SLA",
  data_quality: "Calidad de datos",
  other: "Otra",
};

export interface Incident {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  category: IncidentCategory;
  origin: IncidentOrigin;
  branch: IncidentBranch;
  created_at: string;
  updated_at: string;
}

// Lo que envía el formulario: sin id, status ni fechas (toda incidencia nace en open)
export type IncidentCreate = Pick<
  Incident,
  "title" | "description" | "category" | "origin" | "branch"
>;
export type IncidentField = keyof IncidentCreate;

export interface IncidentFilters {
  status: IncidentStatus | "";
  origin: IncidentOrigin | "";
  branch: IncidentBranch | "";
  category: IncidentCategory | "";
}

export const EMPTY_FILTERS: IncidentFilters = {
  status: "",
  origin: "",
  branch: "",
  category: "",
};

export interface IncidentStats {
  total: number;
  by_status: Record<IncidentStatus, number>;
  by_category: Record<IncidentCategory, number>;
  by_origin: Record<IncidentOrigin, number>;
  by_branch: Record<IncidentBranch, number>;
}

// --- Errores: la API envía un "code" estable y el texto se elige aquí ---
// Diccionario único en español. Si algún día hay soporte bilingüe, basta con traducir
// estos mapas por "code". Con un código desconocido se usa el texto fijo de su status:
// el "message"/"detail" de la API nunca se muestra.

export interface ApiFieldError {
  field: string;
  code: string;
  message?: string;
  allowed?: string[];
}

export class IncidentApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fallback: string | null = null,
    public errors: ApiFieldError[] = [],
    public from: IncidentStatus | null = null,
    public to: IncidentStatus | null = null,
  ) {
    super(code);
    this.name = "IncidentApiError";
  }
}

const FIELD_REQUIRED: Record<string, string> = {
  title: "El título es obligatorio.",
  description: "La descripción es obligatoria.",
  category: "Elige una categoría.",
  origin: "Elige un origen.",
  branch: "Elige una sede.",
  status: "Elige un estado.",
};

const FIELD_EMPTY: Record<string, string> = {
  title: "El título no puede estar vacío.",
  description: "La descripción no puede estar vacía.",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_choice: "Elige una de las opciones de la lista.",
  extra_field_not_allowed: "El formulario ha enviado un dato no permitido.",
  invalid_json: "No se ha podido enviar el formulario. Inténtalo de nuevo.",
  invalid_body: "No se ha podido enviar el formulario. Inténtalo de nuevo.",
  missing_body: "No se ha podido enviar el formulario. Inténtalo de nuevo.",
  invalid_type: "El valor no es válido.",
  invalid_value: "El valor no es válido.",
  validation_error: "Revisa los campos marcados.",
  not_found: "La incidencia ya no existe. Recarga el listado.",
  internal_error: statusErrorMessage(500),
  network_error: statusErrorMessage(0),
  timeout: statusErrorMessage(408),
  invalid_response: "Respuesta inesperada del servidor. Inténtalo de nuevo.",
};

// Mensaje de un error de campo de la API (code → texto)
export function fieldErrorMessage(error: ApiFieldError): string {
  if (error.code === "required") {
    return FIELD_REQUIRED[error.field] ?? "Este campo es obligatorio.";
  }
  if (error.code === "empty_text") {
    return FIELD_EMPTY[error.field] ?? "Este campo no puede estar vacío.";
  }
  return ERROR_MESSAGES[error.code] ?? "El valor no es válido.";
}

// Mensaje general de cualquier error (también de los que no vienen de la API)
export function incidentErrorMessage(e: unknown): string {
  if (!(e instanceof IncidentApiError)) return GENERIC_ERROR;
  if (e.code === "invalid_transition" && e.from && e.to) {
    const from = STATUS_LABELS[e.from] ?? e.from;
    const to = STATUS_LABELS[e.to] ?? e.to;
    const final =
      ALLOWED_TRANSITIONS[e.from]?.length === 0 ? ` «${from}» es un estado final.` : "";
    return `No se puede pasar de «${from}» a «${to}».${final}`;
  }
  return ERROR_MESSAGES[e.code] ?? statusErrorMessage(e.status);
}

async function toApiError(res: Response): Promise<IncidentApiError> {
  let body: Record<string, unknown> | null = null;
  try {
    body = await res.json();
  } catch {
    // respuesta sin JSON (p. ej. de un proxy): se trata como error genérico
  }
  const fallbackCode = res.status >= 500 ? "internal_error" : "unknown";
  return new IncidentApiError(
    res.status,
    typeof body?.code === "string" ? body.code : fallbackCode,
    typeof body?.detail === "string" ? body.detail : null,
    Array.isArray(body?.errors) ? (body.errors as ApiFieldError[]) : [],
    (body?.from as IncidentStatus | undefined) ?? null,
    (body?.to as IncidentStatus | undefined) ?? null,
  );
}

async function incidentRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch (e) {
    const status = failedRequestStatus(e);
    throw new IncidentApiError(status, status === 0 ? "network_error" : "timeout");
  }
  if (!res.ok) throw await toApiError(res);
  try {
    return (await res.json()) as T;
  } catch {
    throw new IncidentApiError(res.status, "invalid_response");
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export function listIncidents(
  filters: IncidentFilters = EMPTY_FILTERS,
): Promise<Incident[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return incidentRequest<Incident[]>(`/api/incidents${qs ? `?${qs}` : ""}`);
}

export function getIncidentStats(): Promise<IncidentStats> {
  return incidentRequest<IncidentStats>("/api/incidents/summary");
}

export function createIncident(data: IncidentCreate): Promise<Incident> {
  return incidentRequest<Incident>("/api/incidents", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  });
}

export function changeIncidentStatus(
  id: string,
  status: IncidentStatus,
): Promise<Incident> {
  return incidentRequest<Incident>(
    `/api/incidents/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ status }),
    },
  );
}

// Fecha de alta. Los históricos del CSV solo llevan día (medianoche UTC): se muestran en
// UTC para que desde Miami no aparezcan con el día anterior.
// Una fecha vacía o mal formada se muestra como «—» en vez de romper la tabla.
export function formatIncidentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
