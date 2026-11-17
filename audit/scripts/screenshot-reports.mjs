// Capturas PNG de los informes de Lighthouse ya generados (no vuelve a ejecutar Lighthouse).
//
// Uso:
//   node screenshot-reports.mjs
//
// Para cada .html de audit/before/ y audit/after/ abre el informe con file:// en un Chrome
// headless, espera a que se pinten los gauges de las 4 categorías y guarda la parte superior
// (puntuaciones + métricas FCP, LCP, TBT, CLS y Speed Index) como .png con el mismo nombre.
// Reutiliza las dependencias del runner (chrome-launcher + puppeteer-core): no añade ninguna.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const PHASES = ["before", "after"];
const VIEWPORT = { width: 1350, height: 1000 };

const chrome = await chromeLauncher.launch({
  chromeFlags: ["--headless=new", "--no-first-run", "--disable-extensions"],
});
let failures = 0;
try {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${chrome.port}`,
    defaultViewport: VIEWPORT,
  });
  for (const phase of PHASES) {
    const dir = path.resolve(here, "..", phase);
    const reports = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
    for (const file of reports) {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(path.join(dir, file)).href, { waitUntil: "load" });
      // Los gauges se pintan por JS: esperar a las 4 puntuaciones con número.
      await page.waitForFunction(
        () => {
          const labels = [...document.querySelectorAll(".lh-scores-header .lh-gauge__percentage")];
          return labels.length >= 4 && labels.every((el) => el.textContent.trim() !== "");
        },
        { timeout: 30000 },
      );
      // Dejar terminar la animación de los arcos.
      await new Promise((r) => setTimeout(r, 1500));
      const bottom = await page.evaluate(() => {
        const metrics = document.querySelector(".lh-category .lh-metrics-container");
        const box = metrics.getBoundingClientRect();
        return Math.ceil(box.bottom + window.scrollY + 24);
      });
      const out = path.join(dir, file.replace(/\.html$/, ".png"));
      await page.screenshot({
        path: out,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: bottom },
        captureBeyondViewport: true,
      });
      console.log(`${phase}/${path.basename(out)} (${VIEWPORT.width}x${bottom})`);
      await page.close();
    }
  }
  await browser.disconnect();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  chrome.kill();
}
process.exit(failures ? 1 : 0);
