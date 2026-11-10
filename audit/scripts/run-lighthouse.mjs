// Runner de Lighthouse para la auditoría de rendimiento de Nexova.
//
// Uso (con la API en :8000, el backoffice con `npm run start` en :3001 y la web con
// `npm run preview` en :4321):
//   node run-lighthouse.mjs before        -> informes en audit/before/
//   node run-lighthouse.mjs after         -> informes en audit/after/
//
// Por cada página y form factor (mobile y desktop) hace RUNS ejecuciones, cada una en un
// Chrome headless nuevo, y guarda la ejecución mediana (computeMedianRun de Lighthouse) en
// HTML y JSON. summary.json recoge las métricas de todas las ejecuciones.
//
// Páginas autenticadas: el backoffice guarda el JWT en localStorage (`nexova_token`).
// Puppeteer abre el origen, guarda el token y Lighthouse audita esa misma pestaña con
// `disableStorageReset: true` (sin "clear storage"), así que el AuthGuard ve la sesión.
// Antes de auditar se vacía la caché HTTP por CDP para que todas las páginas carguen en frío.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { computeMedianRun } from "lighthouse/core/lib/median-run.js";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const phase = process.argv[2];
if (!["before", "after"].includes(phase)) {
  console.error("Uso: node run-lighthouse.mjs <before|after>");
  process.exit(1);
}

const RUNS = Number(process.env.LH_RUNS ?? 3);
const API = process.env.LH_API ?? "http://localhost:8000";
const BACKOFFICE = process.env.LH_BACKOFFICE ?? "http://localhost:3001";
const WEBSITE = process.env.LH_WEBSITE ?? "http://localhost:4321";
// Usuario local de pruebas (TinyDB de desarrollo, nunca producción). Se registra si no existe.
const EMAIL = process.env.LH_EMAIL ?? "lighthouse.audit@nexova-demo.com";
const PASSWORD = process.env.LH_PASSWORD ?? "lighthouse-audit-local";

const PAGES = [
  { id: "web-home", url: `${WEBSITE}/`, auth: false },
  { id: "bo-login", url: `${BACKOFFICE}/login`, auth: false },
  { id: "bo-incidencias", url: `${BACKOFFICE}/incidencias`, auth: true },
  { id: "bo-proveedores", url: `${BACKOFFICE}/proveedores`, auth: true },
];
const FORM_FACTORS = ["mobile", "desktop"];

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", phase);
fs.mkdirSync(outDir, { recursive: true });

async function getToken() {
  const login = () =>
    fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: EMAIL, password: PASSWORD }),
    });
  let res = await login();
  if (res.status === 401) {
    const reg = await fetch(`${API}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Lighthouse Audit" }),
    });
    if (!reg.ok) throw new Error(`Registro fallido: ${reg.status} ${await reg.text()}`);
    res = await login();
  }
  if (!res.ok) throw new Error(`Login fallido: ${res.status}`);
  return (await res.json()).access_token;
}

async function runOnce(pageDef, formFactor) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
  });
  try {
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
    const page = await browser.newPage();
    if (pageDef.auth) {
      const token = await getToken();
      // Una página ligera del mismo origen para escribir en su localStorage
      await page.goto(`${BACKOFFICE}/_lh-blank`, { waitUntil: "domcontentloaded" });
      await page.evaluate((t) => localStorage.setItem("nexova_token", t), token);
      // Esa visita deja los chunks de JS en la caché HTTP. Se vacía (localStorage se
      // conserva) para medir en frío, igual que las páginas públicas.
      const cdp = await page.createCDPSession();
      await cdp.send("Network.clearBrowserCache");
      await cdp.detach();
    }
    const flags = {
      output: ["html", "json"],
      logLevel: "error",
      disableStorageReset: true,
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    };
    const config = formFactor === "desktop" ? desktopConfig : undefined;
    const result = await lighthouse(pageDef.url, flags, config, page);
    await browser.disconnect();
    return result;
  } finally {
    try {
      chrome.kill();
    } catch {
      // En Windows a veces no puede borrar el perfil temporal: no afecta al resultado
    }
  }
}

function metricsOf(lhr) {
  const a = lhr.audits;
  const score = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
  return {
    finalUrl: lhr.finalDisplayedUrl,
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
    fcpMs: Math.round(a["first-contentful-paint"].numericValue),
    lcpMs: Math.round(a["largest-contentful-paint"].numericValue),
    cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
    tbtMs: Math.round(a["total-blocking-time"].numericValue),
    siMs: Math.round(a["speed-index"].numericValue),
    totalBytes: a["total-byte-weight"]?.numericValue ?? null,
  };
}

const summary = { phase, date: new Date().toISOString(), runs: RUNS, pages: {} };

for (const pageDef of PAGES) {
  for (const formFactor of FORM_FACTORS) {
    const key = `${pageDef.id}.${formFactor}`;
    const results = [];
    for (let i = 1; i <= RUNS; i++) {
      process.stdout.write(`${key} run ${i}/${RUNS}... `);
      const r = await runOnce(pageDef, formFactor);
      const m = metricsOf(r.lhr);
      console.log(`perf ${m.performance} · LCP ${m.lcpMs} ms · ${m.finalUrl}`);
      if (pageDef.auth && !m.finalUrl.startsWith(pageDef.url)) {
        throw new Error(`${key}: redirigido a ${m.finalUrl}, la sesión no se aplicó`);
      }
      results.push(r);
    }
    const median = computeMedianRun(results.map((r) => r.lhr));
    const medianResult = results.find((r) => r.lhr === median);
    const [html, json] = medianResult.report;
    fs.writeFileSync(path.join(outDir, `${key}.html`), html);
    fs.writeFileSync(path.join(outDir, `${key}.json`), json);
    summary.pages[key] = {
      median: metricsOf(median),
      all: results.map((r) => metricsOf(r.lhr)),
    };
  }
}

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`\nInformes en ${outDir}`);
