# Imagen de desarrollo de las interfaces: website (Astro, puerto 3000) y
# backoffice (Next.js, puerto 3001) en un único contenedor.
#
# Contexto de build: ./uis. El backoffice importa packages/shared por ruta
# relativa (../../../packages/shared/src), así que docker-compose.yml pasa
# packages/shared como contexto adicional "shared" y aquí se reproduce la
# misma estructura del monorepo: /app/uis/<app> y /app/packages/shared.
#
# Node 22 (LTS): la misma versión mayor que el entorno local. Astro 7 exige >=22.12.
FROM node:22-alpine

# bash para "wait -n" en start.sh
RUN apk add --no-cache bash

ENV NEXT_TELEMETRY_DISABLED=1 \
    ASTRO_TELEMETRY_DISABLED=1

WORKDIR /app/uis

# Dependencias de cada app por separado (cada una tiene su propio lockfile).
# Primero solo package.json + package-lock.json para aprovechar la caché.
COPY website/package.json website/package-lock.json ./website/
RUN cd website && npm ci

COPY backoffice/package.json backoffice/package-lock.json ./backoffice/
RUN cd backoffice && npm ci

# Código de packages/shared que consume el backoffice
COPY --from=shared src /app/packages/shared/src

# Código fuente (en local, docker-compose.yml lo sustituye por bind mounts)
COPY website ./website
COPY backoffice ./backoffice
COPY start.sh ./start.sh
# Red de seguridad por si start.sh llega con CRLF (.gitattributes ya fuerza LF)
RUN sed -i 's/\r$//' ./start.sh

EXPOSE 3000 3001

CMD ["bash", "/app/uis/start.sh"]
