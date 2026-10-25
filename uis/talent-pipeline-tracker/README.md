# Talent Pipeline Tracker — Nexova

Herramienta interna del equipo de Operaciones de Selección de Nexova
para gestionar el pipeline de candidaturas.

## Requisitos
Node.js 18+

## Configuración
Crea un archivo `.env.local` en la raíz del proyecto:

```
NEXT_PUBLIC_API_URL=https://playground.4geeks.com/tracker/api/v1
NEXT_PUBLIC_AUTH_API_URL=http://localhost:8000
```

- `NEXT_PUBLIC_API_URL`: API de 4Geeks con las candidaturas y sus notas. Sus llamadas no llevan el token de Nexova.
- `NEXT_PUBLIC_AUTH_API_URL`: API de Nexova (`services/api`) contra la que se inicia sesión y que protege el tracker. Es opcional: si no se define, se usa `http://localhost:8000`.

## Instalación y arranque
npm install
npm run dev

Disponible en http://localhost:3000