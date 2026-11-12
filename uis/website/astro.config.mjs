// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// WEBSITE_BASE solo lo define el workflow de GitHub Pages
// (/company-project-ai-engineering/uis/website). En local la web vive en "/".
export default defineConfig({
  base: process.env.WEBSITE_BASE || '/',
  // index.astro → index.html, application.astro → application.html (URLs del Hito 1)
  build: { format: 'file' },
  server: { port: 4321 },
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    // En Docker Desktop (Windows) los eventos de fichero de los bind mounts no
    // siempre llegan al contenedor: docker-compose.yml activa el polling.
    server: {
      watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    },
  },
});
