#!/usr/bin/env bash
# Despliegue del monorepo de Nexova en el VPS (ticket #infra-40, fase 2).
#
# Idempotente: se puede ejecutar varias veces y solo hace lo que falte.
# Uso (como root, en el VPS):
#   bash deploy-vps.sh
# Variables opcionales:
#   APP_DIR=/root/company-project-ai-engineering  carpeta del repo
#   ALLOW_LOW_MEMORY=1                            despliega aunque haya menos de ~2 GB de RAM
#
# Guía paso a paso: docs/docker/DEPLOY_VPS.md
set -euo pipefail

REPO_URL="https://github.com/Caro-it/company-project-ai-engineering.git"
BRANCH="feature/docker-monorepo"
APP_DIR="${APP_DIR:-$HOME/company-project-ai-engineering}"
SWAPFILE="/swapfile"
MIN_RAM_MB=1900

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "ejecuta el script como root (o con sudo)."

# ---------------------------------------------------------------------------
# 1. Swap de 2 GB, solo si no hay ningún swap activo
# ---------------------------------------------------------------------------
log "Swap"
if swapon --show --noheadings | grep -q .; then
  echo "Ya hay swap activo; no se toca:"
  swapon --show
elif [ -f "$SWAPFILE" ]; then
  echo "$SWAPFILE existe pero no está activo: se activa."
  swapon "$SWAPFILE"
else
  echo "Creando $SWAPFILE de 2 GB…"
  fallocate -l 2G "$SWAPFILE"
  chmod 600 "$SWAPFILE"
  mkswap "$SWAPFILE"
  swapon "$SWAPFILE"
fi
# Que sobreviva a un reinicio
grep -q "^$SWAPFILE " /etc/fstab || echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
free -h

# ---------------------------------------------------------------------------
# 2. Docker Engine + Compose v2, solo si faltan (repositorio oficial de Docker)
# ---------------------------------------------------------------------------
log "Docker Engine y Compose v2"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker ya está instalado:"
else
  apt-get update
  apt-get install -y ca-certificates curl git
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
docker --version
docker compose version
# additional_contexts (docker-compose.yml) necesita Compose 2.17 o superior
compose_version="$(docker compose version --short | sed 's/^v//')"
if [ "$(printf '%s\n2.17.0\n' "$compose_version" | sort -V | head -1)" != "2.17.0" ]; then
  fail "Compose $compose_version es demasiado antiguo: hace falta 2.17 o superior."
fi

# ---------------------------------------------------------------------------
# 3. Firewall: OpenSSH SIEMPRE antes que cualquier otra regla
# ---------------------------------------------------------------------------
log "Firewall (ufw)"
command -v ufw >/dev/null 2>&1 || apt-get install -y ufw
ufw allow OpenSSH
ufw allow 3000/tcp   # website (Astro)
ufw allow 3001/tcp   # backoffice (Next.js)
ufw allow 8000/tcp   # API (FastAPI)
# --force: sin la pregunta interactiva. SSH ya está permitido justo arriba.
ufw --force enable
ufw status verbose

# ---------------------------------------------------------------------------
# 4. Clonar o actualizar el repo en la rama del ticket
# ---------------------------------------------------------------------------
log "Repositorio ($BRANCH)"
command -v git >/dev/null 2>&1 || apt-get install -y git
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git log --oneline -1

# ---------------------------------------------------------------------------
# 5. .env de producción: lo crea la persona a mano, nunca el script
# ---------------------------------------------------------------------------
log "Fichero .env"
if [ ! -f .env ]; then
  fail "no existe $APP_DIR/.env.
Créalo a partir de la plantilla y vuelve a ejecutar este script:
  cp $APP_DIR/.env.production.example $APP_DIR/.env
  sed -i \"s/__GENERA_CON_OPENSSL__/\$(openssl rand -hex 32)/\" $APP_DIR/.env
  nano $APP_DIR/.env    # pega las claves y sustituye <IP_VPS>
Guía completa: docs/docker/DEPLOY_VPS.md"
fi
# Solo líneas de valores (los comentarios de la plantilla también citan <IP_VPS>)
pending="$(grep -nvE '^[[:space:]]*#' .env | grep -E '<PEGA_AQUI|<IP_VPS>|__GENERA_CON_OPENSSL__' | cut -d= -f1 || true)"
if [ -n "$pending" ]; then
  fail ".env todavía tiene huecos sin rellenar (<PEGA_AQUI…>, <IP_VPS> o __GENERA_CON_OPENSSL__):
$pending"
fi
chmod 600 .env
echo ".env encontrado y sin huecos."

# ---------------------------------------------------------------------------
# 6. Memoria: next dev + astro dev + uvicorn + OpenClaw no caben en 1 GB
# ---------------------------------------------------------------------------
log "Memoria"
ram_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
free -h
if [ "$ram_mb" -lt "$MIN_RAM_MB" ] && [ "${ALLOW_LOW_MEMORY:-0}" != "1" ]; then
  fail "el VPS tiene ${ram_mb} MB de RAM (mínimo recomendado: ${MIN_RAM_MB} MB).
Con tan poca memoria, el build y los servidores de desarrollo pueden dejar sin RAM
a OpenClaw. Opciones:
  - Redimensionar el droplet a 2 GB o más (recomendado) y volver a ejecutar.
  - Asumir el riesgo: ALLOW_LOW_MEMORY=1 bash $0"
fi

# ---------------------------------------------------------------------------
# 7. Build y arranque
# ---------------------------------------------------------------------------
log "docker compose up -d --build"
# Las imágenes se construyen de una en una para no sumar los picos de memoria
docker compose build api
docker compose build uis
docker compose up -d --build

log "docker compose ps"
docker compose ps
echo
echo "Comprueba en el navegador: http://<IP_VPS>:3000 · http://<IP_VPS>:3001 · http://<IP_VPS>:8000/docs"
echo "Consumo de memoria: free -h · docker stats --no-stream"
