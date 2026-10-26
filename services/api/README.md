# Nexova API

API FastAPI centralizada de Nexova.

## Instalación

```powershell
cd services/api
pip install -r requirements.txt
```

## Arranque

```powershell
uvicorn app.main:app --reload --port 8000
```

Documentación interactiva: http://localhost:8000/docs

## Endpoints

| Método | Ruta                            | Descripción                                                                       |
| ------ | ------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/health`                   | Comprobación de estado                                                            |
| POST   | `/api/incidents/analyze`        | Recibe un CSV (`multipart/form-data`, campo `file`) y devuelve el resumen en JSON |
| GET    | `/api/incidents/results/export` | Descarga el último análisis como CSV                                              |

## Errores

| Código | Caso                                    |
| ------ | --------------------------------------- |
| 400    | Fichero vacío o no UTF-8                |
| 404    | Exportar sin haber analizado antes      |
| 413    | Fichero mayor de 50 MB                  |
| 415    | El fichero no es `.csv`                 |
| 422    | Cabecera incorrecta o CSV sin registros |

La lógica de validación y métricas vive en `packages/shared/incidents_core` y es la misma que usa `scripts/analyze.py`.

### Gestor de incidencias: modelo y seed

Fuente de verdad: `docs/CONTEXT-incident-manager-nexova.md`.

- Valores permitidos (estados, orígenes, categorías y sedes), transiciones y mapas CSV → modelo en `incidents_core/incident_model.py`. Modelos Pydantic en `app/incident_models.py`.
- Persistencia en `data/incidents.json`: tabla `incidents` (id = uuid4 en string) y tabla `incident_seed_log` (`ticket_id` → `incident_id`, para la idempotencia del seed).
- Carga del histórico desde la raíz del repo (es idempotente, se puede repetir):

  ```bash
  services/api/.venv/Scripts/python scripts/seed_incidents.py   # usa scripts/incidents-nexova.csv
  ```

  Resultado esperado con una BD limpia: 100 filas leídas, 96 insertadas y 4 inválidas. La segunda ejecución inserta 0. El informe solo muestra contadores y etiquetas de reglas, nunca datos de los registros.

## Autenticación

Autenticación JWT stateless (ticket AUTH-01). Los usuarios y sus perfiles se guardan en TinyDB, en `data/auth.json`, separados de los proveedores (`data/suppliers.json`). Las contraseñas se guardan con bcrypt y nunca salen en las respuestas.

### Variables de entorno

Se leen de `services/api/.env` (funciona desde cualquier directorio de arranque). Copia `.env.example` a `.env` y cambia `SECRET_KEY`:

| Variable                      | Obligatoria | Valor por defecto | Descripción                          |
| ----------------------------- | ----------- | ----------------- | ------------------------------------ |
| `SECRET_KEY`                  | Sí          | —                 | Clave con la que se firman los JWT   |
| `ALGORITHM`                   | No          | `HS256`           | Algoritmo de firma                   |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No          | `30`              | Minutos de validez del token         |
| `RESEND_API_KEY`              | No          | —                 | Clave de [Resend](https://resend.com/api-keys) para enviar el email de recuperación. Sin ella no se envía nada y queda un aviso en los logs |
| `EMAIL_FROM`                  | No          | `Nexova <onboarding@resend.dev>` | Remitente del email. `onboarding@resend.dev` solo entrega al email de tu cuenta de Resend; para otros destinatarios hace falta un dominio verificado |
| `FRONTEND_URL`                | No          | `http://localhost:3001` | URL del backoffice con la que se construye el enlace `/reset-password?token=…` |
| `RESET_TOKEN_EXPIRE_MINUTES`  | No          | `30`              | Minutos de validez del enlace de recuperación |

Sin `SECRET_KEY` la API no arranca. Para generar una clave aleatoria:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Crear el admin inicial

El alta pública (`POST /users`) siempre crea usuarios con rol `user`. El primer admin se crea por consola:

```powershell
cd services/api
create-admin            # o: python -m app.create_admin
```

Pide el email y la contraseña (dos veces, sin mostrarla). Si el email ya existe, lo promueve a `admin` y lo reactiva sin cambiar su contraseña.

### Flujo en `/docs`

1. Crea un usuario con `POST /users` o un admin con `create-admin`.
2. Pulsa **Authorize**, escribe el email en `username` y la contraseña en `password`. Swagger llama a `POST /auth/login` y guarda el token.
3. Las rutas protegidas (candado) envían ya `Authorization: Bearer <token>`.
4. Comprueba la sesión con `GET /auth/me`.

El token caduca a los `ACCESS_TOKEN_EXPIRE_MINUTES` minutos; después hay que volver a pulsar Authorize. No hay logout en el servidor: basta con descartar el token.

### Rutas públicas y protegidas

| Método   | Ruta                               | Acceso                                           |
| -------- | ---------------------------------- | ------------------------------------------------ |
| GET      | `/api/health`                      | Pública                                          |
| POST     | `/auth/login`                      | Pública (formulario: `username` = email)         |
| POST     | `/users`                           | Pública (alta con rol `user`)                    |
| POST     | `/auth/forgot-password`            | Pública                                          |
| POST     | `/auth/reset-password`             | Pública (requiere el token del email)            |
| POST     | `/auth/change-password`            | Protegida                                        |
| GET      | `/auth/me`                         | Protegida                                        |
| GET      | `/users`                           | Protegida, **solo admin**                        |
| GET      | `/users/{user_id}`                 | Protegida, el propio usuario o admin             |
| PUT      | `/users/{user_id}`                 | Protegida, el propio usuario o admin (*)         |
| DELETE   | `/users/{user_id}`                 | Protegida, el propio usuario o admin             |
| GET, PUT | `/profiles/me`                     | Protegida, solo el propio perfil                 |
| POST     | `/api/incidents/analyze`           | Protegida                                        |
| GET      | `/api/incidents/results/export`    | Protegida                                        |
| GET, POST | `/suppliers`                      | Protegida                                        |
| GET, DELETE | `/suppliers/{supplier_id}`      | Protegida                                        |
| PATCH    | `/suppliers/{supplier_id}/rate`    | Protegida                                        |
| PATCH    | `/suppliers/{supplier_id}/status`  | Protegida                                        |

(*) Solo un admin puede cambiar `role` o `is_active`.

### Errores de autenticación

| Código | Caso                                                                                          |
| ------ | --------------------------------------------------------------------------------------------- |
| 401    | Sin token, token inválido o caducado, usuario borrado o desactivado, o credenciales incorrectas |
| 403    | El usuario no tiene permiso: no es admin en `GET /users`, accede a otro usuario sin ser admin, o intenta cambiar `role`/`is_active` sin ser admin |
| 400    | `reset-password`: token inexistente, caducado o ya usado. `change-password`: la contraseña actual no es correcta |
| 409    | El email ya está registrado (alta o cambio de email)                                          |
| 422    | Datos no válidos: email incorrecto, contraseña de menos de 8 caracteres o más de 72 bytes, o campos no permitidos |

En las rutas `/users/{user_id}` el permiso se comprueba antes que la existencia: un usuario que no es admin recibe 403 aunque el id no exista, así no puede averiguar qué ids hay. El login responde con el mismo mensaje tanto si el email no existe como si la contraseña es incorrecta.

### Recuperación y cambio de contraseña (AUTH-03)

- `POST /auth/forgot-password` (`{"email": "..."}`) responde **siempre** 200 con `"Si esa dirección está registrada, recibirás un enlace en breve"`. La búsqueda del usuario, el token y el envío se hacen en segundo plano (`BackgroundTasks`), así que ni la respuesta ni su tiempo delatan si el email existe. Si el envío falla, solo queda en los logs (sin el enlace).
- El token es `secrets.token_urlsafe(32)`. En TinyDB (`data/auth.json`, tabla `password_reset_tokens`) solo se guarda su hash sha256, con `expires_at` y `used_at`. Pedir un enlace nuevo invalida los anteriores del mismo usuario. Los usuarios desactivados no reciben enlace.
- El email (HTML y texto) lleva el enlace `{FRONTEND_URL}/reset-password?token=<token>`.
- `POST /auth/reset-password` (`{"token": "...", "new_password": "..."}`) acepta el token una sola vez y antes de que caduque; si no, 400. La nueva contraseña sigue las mismas reglas que el alta (8 caracteres a 72 bytes).
- `POST /auth/change-password` (`{"current_password": "...", "new_password": "..."}`) necesita el token de sesión. Si la contraseña actual no es correcta, 400 (no 401: la sesión sigue siendo válida). Al cambiarla se invalidan los enlaces de recuperación pendientes.

### Limitaciones conocidas

- **Un admin puede quitarse su propio rol o desactivarse** con `PUT /users/{user_id}`, y la API puede quedarse sin ningún admin. Para recuperarlo, ejecuta `create-admin` con su email: lo vuelve a promover a `admin` y lo reactiva.
- Restablecer o cambiar la contraseña **no invalida los JWT ya emitidos**: siguen valiendo hasta que caducan (la API es stateless).
- Los tokens no se pueden revocar antes de que caduquen. Desactivar o borrar un usuario sí invalida sus tokens, porque cada petición comprueba que el usuario exista y esté activo.

### Verificación manual

| # | Prueba | Resultado | Captura |
|---|---|---|---|
| 1 | Rutas en `/docs` (candado = protegida) | — | [01a](../../docs/screenshots/auth-api/01a-docs-overview.png) · [01b](../../docs/screenshots/auth-api/01b-docs-overview.png) |
| 2 | `GET /suppliers` sin token | 401 | [02](../../docs/screenshots/auth-api/02-suppliers-sin-token-401.png) |
| 3 | `POST /users` con email duplicado | 409 | [03](../../docs/screenshots/auth-api/03-registro-duplicado-409.png) |
| 4 | `POST /users` nuevo usuario | 201 | [04](../../docs/screenshots/auth-api/04-registro-201.png) |
| 5 | Login + `GET /auth/me` | 200 | [05](../../docs/screenshots/auth-api/05-auth-me-200.png) |
| 6 | `GET /suppliers` con token | 200 | [06](../../docs/screenshots/auth-api/06-suppliers-con-token-200.png) |
| 7 | `GET /users` como usuario normal | 403 | [07](../../docs/screenshots/auth-api/07-users-no-admin-403.png) |
| 8 | `GET /users/abc` como usuario normal | 403 | [08](../../docs/screenshots/auth-api/08-user-ajeno-403.png) |
| 9 | `GET /users` como admin | 200 | [09](../../docs/screenshots/auth-api/09-users-admin-200.png) |
| 10 | Token mal formado (`curl.exe`) | 401 | [10](../../docs/screenshots/auth-api/10-token-falso-401.png) |
