#!/usr/bin/env bash
# Arranca la web pública (Astro) y el backoffice (Next.js) en paralelo dentro
# del contenedor "uis". Si uno de los dos procesos termina, se para el otro y
# el contenedor sale con su código: nunca queda una app huérfana.
set -uo pipefail

# Website: el ticket pide Next.js en el 3000, pero la web de Nexova es Astro.
# Se sirve en modo dev en el 3000 (desviación documentada en el README).
(cd /app/uis/website && exec ./node_modules/.bin/astro dev --host 0.0.0.0 --port 3000) &
website_pid=$!

# Backoffice: Next.js en modo dev en el 3001. Con webpack y no con Turbopack:
# Turbopack ignora WATCHPACK_POLLING y, con bind mounts en Docker Desktop
# (Windows), no detecta los cambios. Fuera de Docker, npm run dev sigue con Turbopack.
(cd /app/uis/backoffice && exec ./node_modules/.bin/next dev --webpack --hostname 0.0.0.0 --port 3001) &
backoffice_pid=$!

stop_all() {
  kill -TERM "$website_pid" "$backoffice_pid" 2>/dev/null
  wait
}

# docker compose stop/down envía SIGTERM: se reenvía a las dos apps.
trap 'stop_all; exit 143' TERM INT

# wait -n vuelve en cuanto termina cualquiera de los dos procesos.
wait -n
status=$?
echo "start.sh: una de las apps ha terminado (código ${status}); parando el contenedor" >&2
stop_all
# Aunque la app haya salido con 0, que el contenedor no parezca sano.
if [ "$status" -eq 0 ]; then status=1; fi
exit "$status"
