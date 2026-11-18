// TelemetryService del backoffice (proyecto "Telemetry – Frontend capture").
// Contrato: docs/telemetry/telemetry-plan.md y docs/telemetry/event-schemas.json.
//
// - Única puerta de entrada: track(eventType, properties). Ningún componente llama a fetch
//   para telemetría; este archivo es el único que habla con el receptor.
// - El servicio añade el envelope: eventId, timestamp (momento de captura, UTC), sessionId,
//   userId, schemaVersion, requestId, source y environment. Quien llama a track() solo pasa
//   las properties del evento.
// - Allowlist: se descarta cualquier clave que no esté en el esquema del evento, y un evento
//   sin sus claves obligatorias no se envía.
// - Cola local en memoria + envío en lotes: cada FLUSH_INTERVAL_MS o al llegar a
//   MAX_BATCH_SIZE eventos, lo que ocurra antes. Nunca un request por evento.
// - Al ocultar o cerrar la pestaña (visibilitychange / pagehide) la cola se vacía con
//   navigator.sendBeacon, que el navegador entrega aunque la página se esté destruyendo.
// - Reintentos: hasta MAX_RETRIES con espera exponencial (1 s, 2 s, 4 s); después el lote se
//   descarta. La telemetría nunca bloquea ni rompe la aplicación.
// - URL del receptor: NEXT_PUBLIC_TELEMETRY_ENDPOINT. Sin ella, la telemetría está apagada.
import { tokenSubject } from "@/lib/auth";
import {
  TELEMETRY_EVENT_KEYS,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEventProperties,
  type TelemetryEventType,
} from "@/lib/telemetryEvents.generated";

export const TELEMETRY_ENDPOINT = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT ?? "";

export const FLUSH_INTERVAL_MS = 10_000;
export const MAX_BATCH_SIZE = 20;
export const MAX_RETRIES = 3;
export const BASE_BACKOFF_MS = 1_000;
// Tope de la cola: si el receptor no responde durante mucho tiempo, se pierden los más viejos
export const MAX_QUEUE_SIZE = 200;
// Sesión: rota tras 30 min sin actividad (plan §3.1)
export const SESSION_IDLE_MS = 30 * 60 * 1000;
// Un requestId solo se asocia a eventos capturados justo después de la respuesta
const REQUEST_ID_MAX_AGE_MS = 2_000;

const SESSION_KEY = "nexova_telemetry_session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Eventos que son consecuencia directa de una petición a la API: llevan su requestId
const REQUEST_EVENTS = new Set<TelemetryEventType>([
  "inbound_order_created",
  "outbound_order_created",
  "stock_threshold_triggered",
  "direct_stock_edit_rejected",
  "kit_cost_variance_detected",
  "inbound_order_rejected",
  "outbound_order_rejected",
  "stock_depleted",
  "login_succeeded",
  "login_failed",
  "session_expired",
  "api_request_failed",
  "incident_created",
  "supplier_rate_changed",
]);

export interface TelemetryEnvelope {
  eventId: string;
  timestamp: string;
  sessionId: string | null;
  userId: string | null;
  event_type: TelemetryEventType;
  schemaVersion: string;
  requestId: string | null;
  source: "backoffice";
  environment: "development" | "production";
  properties: Record<string, unknown>;
}

let queue: TelemetryEnvelope[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;
let lastRequest: { id: string; at: number } | null = null;
const beforeFlushHooks = new Set<() => void>();

const isBrowser = () => typeof window !== "undefined";
const isDev = () => process.env.NODE_ENV !== "production";

function warn(message: string, detail?: unknown): void {
  if (isDev()) console.warn(`[telemetry] ${message}`, detail ?? "");
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Respaldo para navegadores sin randomUUID (contextos no seguros)
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.floor(Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
}

// --- Sesión ------------------------------------------------------------------------------

interface StoredSession {
  id: string;
  lastActivity: number;
}

function readSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSession;
    return UUID_RE.test(data.id) && typeof data.lastActivity === "number" ? data : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // sin sessionStorage la sesión vive solo en esta carga de página
  }
}

let memorySession: StoredSession | null = null;

// sessionId de esta pestaña: se crea al hacer login (startTelemetrySession) o, si falta,
// en el primer evento; caduca tras SESSION_IDLE_MS sin actividad.
export function getSessionId(now = Date.now()): string {
  let session = readSession() ?? memorySession;
  if (!session || now - session.lastActivity > SESSION_IDLE_MS) {
    session = { id: newId(), lastActivity: now };
  }
  session = { ...session, lastActivity: now };
  memorySession = session;
  writeSession(session);
  return session.id;
}

// Llamar tras un login correcto: cada login abre una sesión de telemetría nueva
export function startTelemetrySession(): void {
  if (!isBrowser()) return;
  memorySession = { id: newId(), lastActivity: Date.now() };
  writeSession(memorySession);
}

// --- Correlación con la API ---------------------------------------------------------------

// lib/api.ts registra aquí el X-Request-ID de cada respuesta (o de cada fallo de red)
export function noteRequestId(requestId: string): void {
  if (UUID_RE.test(requestId)) lastRequest = { id: requestId, at: Date.now() };
}

function currentRequestId(eventType: TelemetryEventType): string | null {
  if (!REQUEST_EVENTS.has(eventType) || !lastRequest) return null;
  return Date.now() - lastRequest.at <= REQUEST_ID_MAX_AGE_MS ? lastRequest.id : null;
}

// --- Allowlist ---------------------------------------------------------------------------

// Solo las claves del esquema, sin undefined. null si falta una obligatoria.
export function sanitizeProperties(
  eventType: TelemetryEventType,
  properties: Record<string, unknown>,
): Record<string, unknown> | null {
  const keys = TELEMETRY_EVENT_KEYS[eventType];
  if (!keys) return null;
  const clean: Record<string, unknown> = {};
  for (const key of keys.allowed) {
    const value = properties[key];
    if (value !== undefined && value !== null) clean[key] = value;
  }
  const dropped = Object.keys(properties).filter((k) => !keys.allowed.includes(k));
  if (dropped.length > 0) warn(`${eventType}: claves fuera del allowlist descartadas`, dropped);
  const missing = keys.required.filter((k) => !(k in clean));
  if (missing.length > 0) {
    warn(`${eventType}: faltan claves obligatorias, evento descartado`, missing);
    return null;
  }
  return clean;
}

// --- API pública -------------------------------------------------------------------------

export function track<E extends TelemetryEventType>(
  eventType: E,
  properties: TelemetryEventProperties[E],
): void {
  if (!isBrowser()) return;
  try {
    const clean = sanitizeProperties(eventType, properties as Record<string, unknown>);
    if (!clean) return;
    const userId = tokenSubject();
    queue.push({
      eventId: newId(),
      timestamp: new Date().toISOString(),
      sessionId: getSessionId(),
      userId: userId && UUID_RE.test(userId) ? userId : null,
      event_type: eventType,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      requestId: currentRequestId(eventType),
      source: "backoffice",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      properties: clean,
    });
    if (queue.length > MAX_QUEUE_SIZE) queue = queue.slice(-MAX_QUEUE_SIZE);
    installFlushListeners();
    if (queue.length >= MAX_BATCH_SIZE) {
      void flush();
    } else {
      scheduleFlush();
    }
  } catch (e) {
    warn("error al capturar un evento", e);
  }
}

// Código que acumula datos y emite su evento justo antes de vaciar la cola (Web Vitals)
export function onBeforeFlush(hook: () => void): () => void {
  beforeFlushHooks.add(hook);
  return () => beforeFlushHooks.delete(hook);
}

// --- Envío -------------------------------------------------------------------------------

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

function takeBatch(): TelemetryEnvelope[] {
  return queue.splice(0, MAX_BATCH_SIZE);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Envía un lote con reintentos. true si el receptor lo aceptó.
export async function sendBatch(
  events: TelemetryEnvelope[],
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<boolean> {
  const body = JSON.stringify({ events });
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await wait(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    try {
      const res = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
      if (res.ok) return true;
      // 4xx: el lote no es válido y repetirlo no lo arregla
      if (res.status < 500 && res.status !== 408 && res.status !== 429) {
        warn(`el receptor rechazó el lote (${res.status}); se descarta`);
        return false;
      }
    } catch {
      // red caída o receptor apagado: se reintenta
    }
  }
  warn(`lote descartado tras ${MAX_RETRIES} reintentos`, events.length);
  return false;
}

// Vacía la cola en lotes de MAX_BATCH_SIZE
export async function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  runBeforeFlushHooks();
  if (!TELEMETRY_ENDPOINT) {
    if (queue.length > 0) warn("NEXT_PUBLIC_TELEMETRY_ENDPOINT no está definida: cola descartada");
    queue = [];
    return;
  }
  const sends: Promise<boolean>[] = [];
  while (queue.length > 0) sends.push(sendBatch(takeBatch()));
  await Promise.all(sends);
}

// Vaciado al ocultar/cerrar la pestaña: sendBeacon con un Blob text/plain (no dispara
// preflight CORS ni necesita cabeceras; el receptor no exige token por esto mismo)
export function flushWithBeacon(): void {
  runBeforeFlushHooks();
  if (!TELEMETRY_ENDPOINT || queue.length === 0) return;
  while (queue.length > 0) {
    const batch = takeBatch();
    const blob = new Blob([JSON.stringify({ events: batch })], {
      type: "text/plain;charset=UTF-8",
    });
    const queued =
      typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)
        : false;
    // El navegador puede rechazar el beacon (tamaño, cuota): último intento con keepalive
    if (!queued) void sendBatch(batch);
  }
}

function runBeforeFlushHooks(): void {
  for (const hook of beforeFlushHooks) {
    try {
      hook();
    } catch (e) {
      warn("error en un hook previo al envío", e);
    }
  }
}

function installFlushListeners(): void {
  if (listenersInstalled || !isBrowser()) return;
  listenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushWithBeacon();
  });
  window.addEventListener("pagehide", flushWithBeacon);
}

// Solo para los tests
export function __resetTelemetryForTests(): void {
  queue = [];
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  lastRequest = null;
  memorySession = null;
  beforeFlushHooks.clear();
}

export function __queueForTests(): TelemetryEnvelope[] {
  return queue;
}
