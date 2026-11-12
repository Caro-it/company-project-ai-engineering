# Despliegue en el VPS — ticket #infra-40, fase 2

Pasos para desplegar `feature/docker-monorepo` en el VPS (Ubuntu 22.04, DigitalOcean), ajustados al [diagnóstico de solo lectura del 2026-11-12](./vps-diagnostico.txt).

## Lo que dijo el diagnóstico

| Comprobación | Estado | Qué implica |
|---|---|---|
| CPU / RAM | **1 vCPU · 957 MiB** (320 MiB disponibles) | **Insuficiente** para `next dev` + `astro dev` + uvicorn + OpenClaw. Ver paso 0 |
| Swap | 2 GB en `/swapfile`, ya activo (317 MiB usados) | No hay que crearlo: el script lo detecta y no lo toca |
| Docker | No instalado | El script lo instala desde el repo oficial |
| ufw | Inactivo | El script permite OpenSSH primero y después lo activa |
| OpenClaw | `openclaw gateway` en el 18789, **solo loopback**, ~360 MiB | ufw no le afecta. Lo que sí le afecta es la falta de RAM |
| Puertos 3000/3001/8000 | Libres | Sin conflictos |
| Disco | 11 GB libres | Suficiente (las imágenes ocupan ~2-3 GB) |

> Todos los comandos se ejecutan **como root en el VPS**, salvo los que indican "en tu PC".
> Sustituye `<IP_VPS>` por la IP pública del droplet y `<alias-ssh>` por el alias de tu `~/.ssh/config`.

---

## Paso 0 — Decidir qué hacer con la RAM (antes de nada)

Con 957 MiB, el build (`npm ci` de dos apps) y los servidores de desarrollo tiran de swap y pueden dejar sin memoria a OpenClaw. El script **se para** en ese punto salvo que se fuerce a propósito.

- **Opción A (recomendada): redimensionar el droplet a 2 GB o más.**
  - Panel de DigitalOcean → Droplet → **Resize** → "CPU and RAM only" (así se puede volver atrás) → 2 GB / 1 vCPU o superior.
  - **Ojo:** el redimensionado apaga el droplet unos minutos. OpenClaw se para durante ese tiempo. Comprueba después que vuelve a arrancar (paso 1).
- **Opción B: desplegar con 1 GB asumiendo el riesgo**, con `ALLOW_LOW_MEMORY=1` (paso 5) y vigilando la memoria (paso 6).

## Paso 1 — Conectarte y ver el estado

En tu PC:

```bash
ssh <alias-ssh>
```

En el VPS:

```bash
free -h
swapon --show
ss -tln | grep -E ':(18789|3000|3001|8000)\b'   # 18789 = OpenClaw; 3000/3001/8000 deben estar libres
```

## Paso 2 — Copiar el script al VPS

En tu PC, desde la raíz del repo:

```bash
scp infra/deploy-vps.sh <alias-ssh>:/root/deploy-vps.sh
```

## Paso 3 — Primera ejecución (instala Docker, ufw y clona el repo)

En el VPS:

```bash
bash /root/deploy-vps.sh
```

Qué hace, en orden:
1. Ve que el swap ya existe y no lo toca.
2. Instala Docker Engine y Compose v2.
3. Ejecuta `ufw allow OpenSSH`, abre 3000, 3001 y 8000, y activa ufw.
4. Clona el repo en `/root/company-project-ai-engineering`, en la rama `feature/docker-monorepo`.
5. **Se para** con el mensaje `no existe …/.env`. **Es lo esperado.**

- Si el repo es privado, `git clone` pide usuario de GitHub y un *personal access token* (no la contraseña).
- Antes de seguir, comprueba que SSH sigue abierto. Desde **otra** terminal de tu PC: `ssh <alias-ssh> echo ok`.

## Paso 4 — Crear el `.env` de producción (aquí van las claves)

En el VPS:

```bash
cd /root/company-project-ai-engineering
cp .env.production.example .env
sed -i "s/__GENERA_CON_OPENSSL__/$(openssl rand -hex 32)/" .env   # SECRET_KEY nueva (no reutilices "cambia-esto")
sed -i "s/<IP_VPS>/AQUI_LA_IP/g" .env                             # cambia AQUI_LA_IP por la IP pública del droplet
nano .env
```

En `nano`, **pega aquí las claves**:

| Línea | Qué pegar |
|---|---|
| `DATABASE_URL=` | La URI del *Transaction pooler* de Supabase, con la contraseña. Si la contraseña lleva `$`, escríbelo como `$$`. Si lleva `@ : / ? # %`, codifícalos en la URL (`@` → `%40`) |
| `RESEND_API_KEY=` | Tu clave de Resend. Si no la tienes, deja la línea como `RESEND_API_KEY=` (vacía) |

Guarda (Ctrl+O, Enter) y sal (Ctrl+X). Comprueba que no queda ningún hueco:

```bash
grep -vE '^\s*#' .env | grep -nE '<PEGA_AQUI|<IP_VPS>|__GENERA' || echo "sin huecos"
grep -E '^(FRONTEND_URL|CORS_ORIGINS|NEXT_PUBLIC_API_URL)=' .env   # deben llevar la IP pública
chmod 600 .env
```

## Paso 5 — Segunda ejecución (build y arranque)

- **Si redimensionaste el droplet (opción A):**

  ```bash
  bash /root/deploy-vps.sh
  ```

- **Si sigues con 1 GB (opción B)**, abre antes la vigilancia del paso 6 en otra terminal:

  ```bash
  ALLOW_LOW_MEMORY=1 bash /root/deploy-vps.sh
  ```

El script construye `api` y después `uis`, de una en una para no sumar los picos de memoria. Luego ejecuta `docker compose up -d --build` y `docker compose ps`. La primera vez tarda varios minutos.

## Paso 6 — Vigilar la memoria y OpenClaw (otra terminal, durante y después del build)

```bash
watch -n 5 'free -h; echo; pgrep -fa "openclaw/dist/index.js gateway" >/dev/null && echo "OpenClaw: vivo" || echo "OpenClaw: CAIDO"; echo; docker stats --no-stream 2>/dev/null'
```

Si el swap se llena o OpenClaw aparece como `CAIDO`, para los contenedores (OpenClaw es lo prioritario):

```bash
cd /root/company-project-ai-engineering && docker compose down
```

## Paso 7 — Comprobar y guardar la evidencia

En el VPS:

```bash
cd /root/company-project-ai-engineering
docker compose ps
for u in localhost:3000/ localhost:3001/login localhost:8000/docs; do echo "$u $(curl -s -o /dev/null -w '%{http_code}' $u)"; done
docker compose exec uis wget -qO- http://api:8000/api/health
docker compose ps > /root/compose-ps-vps.txt
```

En el navegador de tu PC:
- `http://<IP_VPS>:3000`: la web.
- `http://<IP_VPS>:3001/login`: haz un **login real**.
- `http://<IP_VPS>:8000/docs`: la API.

Haz las capturas de `docker compose ps` y del login para el PR (`[CAPTURA VPS]`).

En tu PC, trae la evidencia al repo:

```bash
scp <alias-ssh>:/root/compose-ps-vps.txt docs/docker/compose-ps-vps.txt
```

## Paso 8 — DigitalOcean Cloud Firewall (solo si tienes uno)

Panel → Networking → Firewalls. Si el droplet tiene un firewall asignado, añade reglas de entrada TCP para 3000, 3001 y 8000. Si no tiene ninguno, no hay que hacer nada.

> Docker publica los puertos saltándose ufw (escribe sus propias reglas de iptables): 3000/3001/8000 quedan accesibles aunque ufw no los tuviera abiertos.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El backoffice carga pero el login no hace nada. En la consola del navegador (F12) aparece *cross-origin* o `allowedDevOrigins` | Next 16 en modo dev bloquea sus recursos de desarrollo cuando se abre desde una IP que no es localhost (**no verificado**) | Añadir `allowedDevOrigins: ["<IP_VPS>"]` en `uis/backoffice/next.config.ts` (commit aparte) |
| Error CORS en el login | `CORS_ORIGINS` o `NEXT_PUBLIC_API_URL` no coinciden con la URL del navegador | Revisar `.env` y ejecutar `docker compose up -d --force-recreate` |
| `docker compose logs uis` muestra `Killed`, o el contenedor sale con 137 | Sin memoria | Paso 0, opción A |
| `api` se reinicia o no arranca | `DATABASE_URL` mal copiada (o con `$` sin duplicar) | `docker compose logs api` |
| Se pierde el SSH tras activar ufw | No debería pasar: OpenSSH se permite antes de activarlo | Consola web de DigitalOcean (Droplet → Access → Launch Droplet Console) → `ufw allow OpenSSH` |
