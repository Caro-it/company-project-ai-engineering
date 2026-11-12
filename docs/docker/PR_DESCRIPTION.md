# Contenedorización del monorepo con Docker Compose (#infra-40)

## Qué se ha hecho

El monorepo de Nexova se levanta con un solo comando, `docker compose up`, en local y en el VPS.

- **`uis/Dockerfile`** (`node:22-alpine`):
  - Instala `website` y `backoffice` por separado: `npm ci` en cada carpeta, copiando primero `package.json` y `package-lock.json` para aprovechar la caché.
  - `uis/start.sh` arranca las dos apps en paralelo en `0.0.0.0`. Si una muere, el contenedor sale (`wait -n`): no queda ningún proceso huérfano.
  - `.gitattributes` fuerza LF en los scripts `.sh`.
- **`services/Dockerfile`** (`python:3.12-slim` + uv): `uv pip install --system -r requirements.txt` y `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`.
- **`.dockerignore`** en `uis/` y `services/`: `node_modules`, `.next`, `.env*`, logs, `.venv`, `data/`, tests…
- **`docker-compose.yml`** en la raíz:
  - servicios `uis` (3000, 3001) y `api` (8000) en la red `nexova-net`;
  - `env_file: .env`;
  - bind mounts del código, con volúmenes anónimos para `node_modules` y `.next`;
  - polling para el hot reload;
  - TinyDB persistente en `services/api/data`.
- **Variables:**
  - `.env.example` (local) y `.env.production.example` (VPS) en la raíz, con las mismas claves y sin valores reales;
  - `.env` está en `.gitignore` y nunca ha estado en el historial.
- **Despliegue:**
  - `infra/deploy-vps.sh`: script idempotente que hace swap, Docker, ufw, clonado, comprobación del `.env` y `docker compose up -d --build`, con una salvaguarda de RAM;
  - guía paso a paso en `docs/docker/DEPLOY_VPS.md`;
  - diagnóstico del VPS en `docs/docker/vps-diagnostico.txt`.
- Sección **Docker** en `README.md` y `README.es.md`.

## Desviaciones justificadas

1. **Web en Astro en el 3000.** El ticket habla de Next.js en el 3000, pero la web pública de Nexova es Astro. Se sirve con `astro dev --host 0.0.0.0 --port 3000`. El tracker (Next.js, también en el 3000) queda fuera del contenedor, porque está fuera del alcance del ticket.
2. **`additional_contexts` para `packages/shared`.**
   - `requirements.txt` instala `-e ../../packages/shared/incidents_core` y el backoffice importa `packages/shared/src` por ruta relativa. Las dos rutas quedan fuera de los contextos de build `./services` y `./uis`.
   - Compose pasa `packages/shared` como contexto adicional `shared`. Las imágenes reproducen la estructura del monorepo (`/app/services/api`, `/app/uis/<app>`, `/app/packages/shared`), así que las rutas relativas funcionan sin tocar el código.
3. **URLs del navegador frente a URLs internas.**
   - Todas las llamadas del backoffice a la API salen del **navegador**: son componentes de cliente con el JWT en `localStorage`, sin Server Components ni route handlers que llamen a la API.
   - El navegador no puede resolver el nombre de servicio `api`. Por eso `NEXT_PUBLIC_API_URL` apunta a la URL pública: `http://localhost:8000` en local y `http://<IP_VPS>:8000` en el VPS.
   - Entre contenedores se usa el nombre de servicio, `http://api:8000`. Está comprobado con `docker compose exec uis wget -qO- http://api:8000/api/health`.
   - No hace falta `API_URL_INTERNAL` porque no hay llamadas servidor → servidor.
   - `CORS_ORIGINS` y `FRONTEND_URL` usan los mismos orígenes que el navegador.
4. **`next dev --webpack` dentro de Docker.** Turbopack ignora `WATCHPACK_POLLING` y no detectaba los cambios de los bind mounts en Docker Desktop (Windows): el backoffice no recargaba. Con webpack el hot reload funciona. Fuera de Docker, `npm run dev` sigue usando Turbopack.

## Lo que evaluaremos

- [x] `uis/Dockerfile` con imagen oficial de Node que instala las dependencias de cada app por separado
- [x] `uis/start.sh` arranca website (3000) y backoffice (3001) en `0.0.0.0`; si un proceso muere, el contenedor cae (probado matando Astro: sale con 143)
- [x] `services/Dockerfile` con imagen oficial de Python y uv
- [x] `.dockerignore` en `uis/` y `services/`
- [x] `docker-compose.yml` en la raíz con los dos servicios, puertos 3000/3001/8000 y red con nombre (`nexova-net`)
- [x] Comunicación entre servicios por **nombre de servicio, no localhost** (`http://api:8000` desde el contenedor `uis`); el navegador usa la URL pública (ver desviación 3)
- [x] Variables con `env_file`; ningún secreto en Dockerfiles, YAML ni imágenes (comprobado con `git grep` y `docker image inspect`)
- [x] `.env.example` en la raíz; `.env` fuera de git
- [x] Hot reload comprobado editando la web, el backoffice y un endpoint de la API sin reconstruir
- [x] Persistencia de TinyDB (bind mount de `services/api/data`)
- [x] `docker compose build` + `docker compose up -d` sin pasos extra en local; `docker compose ps` con los 2 servicios en `running`
- [x] `curl` a `localhost:3000`, `localhost:3001` y `localhost:8000/docs` → 200
- [x] Login del backoffice contra la API en local (preflight CORS, registro, login y `/auth/me` desde el origen `localhost:3001`, reproducidos con `curl`)
- [ ] Login probado en un navegador real
- [ ] Despliegue en el VPS con `docker compose up -d --build`
- [ ] `docker compose ps` del VPS con los 2 servicios en `running`
- [ ] Web, backoffice y API accesibles en `http://<IP_VPS>:3000`, `:3001` y `:8000/docs`

## Evidencias

### `docker compose ps` en local

[CAPTURA LOCAL]

(Texto en `docs/docker/compose-ps-local.txt`.)

### `docker compose ps` y login en el VPS

[CAPTURA VPS]

(Texto en `docs/docker/compose-ps-vps.txt`.)

## Cómo probarlo

```bash
cp .env.example .env   # rellenar SECRET_KEY y DATABASE_URL
docker compose up --build
```

- Web: http://localhost:3000
- Backoffice: http://localhost:3001
- API: http://localhost:8000/docs

## Limitaciones y riesgos conocidos

- Es un entorno de **desarrollo** (modo dev y hot reload), no un build de producción optimizado: consume bastante más RAM.
- **RAM del VPS:** el droplet actual tiene 1 vCPU y 957 MiB de RAM, y comparte servidor con OpenClaw. El script se para si hay menos de ~1,9 GB, salvo que se fuerce con `ALLOW_LOW_MEMORY=1`. Lo recomendado es redimensionar a 2 GB o más.
- Los puertos se publican directamente por HTTP, sin dominio, HTTPS ni proxy inverso. Docker publica los puertos saltándose ufw.
- Sin verificar todavía: si Next 16 en modo dev bloquea sus recursos de desarrollo al abrirse desde la IP del VPS (`allowedDevOrigins`). Si pasa, se arregla con una línea en `next.config.ts`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
