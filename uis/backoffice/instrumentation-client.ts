// Se ejecuta antes que el resto del código del navegador (Next.js: instrumentation-client).
// Captura los errores de JavaScript que nadie maneja como frontend_error_captured
// (plan de telemetría: dedupe por fingerprint, 1/min y máx. 20 por sesión).
import { trackFrontendError } from "@/lib/telemetryTrackers";

window.addEventListener("error", (event) => {
  trackFrontendError(event.error ?? event.message, "onerror", window.location.pathname);
});

window.addEventListener("unhandledrejection", (event) => {
  trackFrontendError(event.reason, "unhandledrejection", window.location.pathname);
});
