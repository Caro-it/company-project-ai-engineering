// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// WEBSITE_BASE solo lo define el workflow de GitHub Pages
// (/company-project-ai-engineering/uis/website). En local la web vive en "/".
export default defineConfig({
  base: process.env.WEBSITE_BASE || '/',
  // index.astro → index.html, application.astro → application.html (URLs del Hito 1)
  // inlineStylesheets: la hoja de Tailwind (~5 KB) va en el <head> de cada página en lugar de
  // un <link> que bloquea el render (Lighthouse: render-blocking-insight). En el código fuente
  // no hay etiquetas de estilo escritas a mano: solo aparecen en el HTML generado.
  build: { format: 'file', inlineStylesheets: 'always' },
  server: { port: 4321 },
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
