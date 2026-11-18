"use client";

// Instrumentación transversal del backoffice (piso técnico del proyecto de captura):
// - page_viewed en cada cambio de ruta (debounce 1 s: una redirección inmediata solo
//   cuenta la página final).
// - page_load_recorded: Web Vitals (LCP, INP, CLS, TTFB) de cada página, en un solo evento
//   que se emite al cambiar de página o justo antes de vaciar la cola al ocultar la pestaña.
// Los errores globales (window.onerror / unhandledrejection) los instala
// instrumentation-client.ts, antes de que arranque la app.
import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { onBeforeFlush } from "@/lib/telemetry";
import { trackPageLoad, trackPageViewed, type PageVitals } from "@/lib/telemetryTrackers";

export const PAGE_VIEW_DEBOUNCE_MS = 1_000;

// Las métricas de una página se acumulan aquí hasta emitirlas una vez
const vitalsByPage = new Map<string, PageVitals>();

function emitVitals(pathname: string) {
  const vitals = vitalsByPage.get(pathname);
  if (!vitals) return;
  vitalsByPage.delete(pathname);
  trackPageLoad(pathname, vitals);
}

function emitAllVitals() {
  for (const pathname of [...vitalsByPage.keys()]) emitVitals(pathname);
}

export function TelemetryProvider() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useReportWebVitals((metric) => {
    const page = window.location.pathname;
    const vitals = vitalsByPage.get(page) ?? {};
    // CLS no tiene unidad (3 decimales); el resto son milisegundos
    const value =
      metric.name === "CLS" ? Math.round(metric.value * 1000) / 1000 : Math.round(metric.value);
    if (metric.name === "LCP") vitals.lcp_ms = value;
    else if (metric.name === "INP") vitals.inp_ms = value;
    else if (metric.name === "CLS") vitals.cls = value;
    else if (metric.name === "TTFB") vitals.ttfb_ms = value;
    else return;
    vitalsByPage.set(page, vitals);
  });

  useEffect(() => onBeforeFlush(emitAllVitals), []);

  useEffect(() => {
    if (!pathname) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const referrer = previous.current;
      if (referrer === pathname) return;
      // La página anterior ya no va a dar más métricas: se emiten ahora
      if (referrer) emitVitals(referrer);
      trackPageViewed(pathname, referrer);
      previous.current = pathname;
    }, PAGE_VIEW_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname]);

  return null;
}
