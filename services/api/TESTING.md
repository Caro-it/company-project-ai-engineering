# TESTING.md — API de Nexova (`services/api`)

> Ticket **AUTH-088** — Cobertura de pruebas unitarias para la API de autenticación.

## Cómo ejecutar las pruebas

Desde `services/api`:

```powershell
uv sync                 # instala dependencias (incluye el grupo dev: pytest, pytest-cov)
uv run pytest           # toda la batería
uv run pytest --cov     # batería + cobertura del módulo de autenticación
uv run pytest tests/test_login.py -v   # una sola suite
```

- No hace falta `.env`: `tests/conftest.py` fija un `SECRET_KEY` de prueba.
- TinyDB se sustituye por almacenamiento **en memoria** antes de importar la app: los tests nunca tocan `services/api/data/`.
- Cada test empieza con la BD vacía (fixture `clean_db`, autouse).
- El envío de emails (Resend) se sustituye con `monkeypatch`: los tests no envían correos reales.

### Cobertura de proveedores y perfiles (API-042)

`pyproject.toml` limita `--cov` al módulo de autenticación. Para medir proveedores y perfiles hay un archivo de configuración aparte (con `--cov=app.routers.suppliers…` coverage avisa de que ignora el `include` de `pyproject.toml`):

```powershell
uv run pytest --cov --cov-config=.coveragerc-backoffice --cov-report=term-missing
```

### Jest en `uis/backoffice` (utilidades de `lib/`)

Desde `uis/backoffice`:

```powershell
npm install             # instala jest, ts-jest, @types/jest y jest-environment-jsdom
npm test                # toda la batería de __tests__/
npx jest --coverage     # batería + cobertura de lib/ (informe HTML en coverage/, ignorado por git)
```

- `jest.config.js` (no `.ts`, para no depender de ts-node): preset `ts-jest`, entorno `jsdom`, solo `__tests__/**/*.test.ts`; ignora `e2e/` (Playwright) y `.next/`.
- `ts-jest` usa `tsconfig.jest.json` (CommonJS y resolución `node`), así que el `tsconfig.json` de Next no cambia. El alias `@/` se resuelve con `moduleNameMapper`.
- jsdom no trae `Response`: los tests usan un objeto mínimo con `status` y `json()`.

## Qué se considera "módulo de autenticación" (alcance de la cobertura)

| Archivo | Qué contiene |
|---|---|
| `app/routers/auth.py` | `/auth/login`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` |
| `app/deps.py` | Validación del JWT (`get_current_user`) y permisos |
| `app/security.py` | Hash bcrypt y emisión del JWT |
| `app/services/password_reset.py` | Tokens de recuperación (crear, consumir, invalidar) |
| `app/services/users.py` | Alta y actualización de usuarios (lo que usa el registro) |

Objetivo: **≥ 70 %** en ese conjunto (verificado con `uv run pytest --cov`).

## Criterio: qué se prueba y qué no

Cada test afirma **lo que el endpoint decide**, no cómo lo serializa:
- ✅ "Con contraseña incorrecta no se emite token" · "tras el reset, la contraseña vieja ya no sirve" · "un token de recuperación solo vale una vez".
- ❌ Forma del JSON, cabeceras, que FastAPI devuelva 422 por un tipo mal puesto (eso es el framework).

Cuando se usa el `TestClient`, el código de estado se comprueba porque **es la decisión de negocio** (401 vs 400 vs 200), y siempre se acompaña de una comprobación del estado resultante (BD, login posterior, token marcado como usado…).

## Plan de pruebas por endpoint

### `POST /users` (registro) — `tests/test_register.py`
| Tipo | Caso | Por qué |
|---|---|---|
| Camino feliz | Alta válida → el usuario existe con rol `user`, `is_active=True` y la contraseña guardada como hash (no en claro) | Es la puerta de entrada de todo el sistema |
| Caso límite | Contraseña de exactamente 8 caracteres se acepta; de 7 se rechaza | Frontera de la regla `min_length=8` |
| Caso límite | Email con mayúsculas se guarda en minúsculas y luego se puede hacer login en minúsculas | Evita cuentas duplicadas por mayúsculas |
| Caso límite | Email duplicado → rechazado y no se crea un segundo usuario | Ya cubierto en `test_users_api.py` (409 neutro) |
| Modo de fallo | Intentar registrarse con `role: "admin"` → rechazado, no se crea ningún usuario | Escalada de privilegios |
| Modo de fallo | Contraseña de más de 72 bytes (p. ej. `"ñ" * 37`) → rechazada | Límite de bcrypt; con bytes multibyte, no caracteres |

### `POST /auth/login` — `tests/test_login.py`
| Tipo | Caso | Por qué |
|---|---|---|
| Camino feliz | Credenciales correctas → token cuyo `sub` es el id del usuario y que caduca en `ACCESS_TOKEN_EXPIRE_MINUTES` | Se comprueba el contenido del token, no solo que llegue |
| Caso límite | Email en mayúsculas en el login → funciona | Coherente con el registro |
| Caso límite | Contraseña vacía → no hay token | Campo vacío |
| Modo de fallo | Contraseña incorrecta y email inexistente → **mismo** mensaje genérico | No revelar qué emails existen |
| Modo de fallo | Usuario desactivado (`is_active=False`) con contraseña correcta → no hay token | Una cuenta bloqueada no debe entrar |
| Modo de fallo | Contraseña de más de 72 bytes → 401, no 500 | `verify_password` captura el `ValueError` de bcrypt |

### `GET /auth/me` y validación del JWT — `tests/test_token.py`
| Tipo | Caso | Por qué |
|---|---|---|
| Camino feliz | Token válido → devuelve el email, rol y perfil del usuario del token | |
| Caso límite | Token de un usuario que se ha borrado después → 401 | El token sigue firmado pero el usuario ya no existe |
| Modo de fallo | **Token expirado** → 401 | La regresión que originó el ticket |
| Modo de fallo | Token firmado con otra clave → 401 | Falsificación |
| Modo de fallo | Token malformado (`"abc"`) y sin cabecera `Authorization` → 401 | Solicitud malformada |
| Modo de fallo | Token sin `sub` → 401 | Claim obligatorio |
| Modo de fallo | Usuario desactivado después de hacer login → su token deja de servir | |

### `POST /auth/forgot-password` + `POST /auth/reset-password` — `tests/test_password_reset.py`
| Tipo | Caso | Por qué |
|---|---|---|
| Camino feliz | Pedir enlace → se "envía" un email (mock) con un token; con ese token se cambia la contraseña; la vieja ya no sirve y la nueva sí | Flujo completo |
| Caso límite | Pedir dos enlaces seguidos → solo funciona el último | Invalidación de pendientes |
| Caso límite | Email no registrado → misma respuesta y **no** se envía email | Enumeración de usuarios |
| Modo de fallo | Token reutilizado → 400 la segunda vez | Un solo uso |
| Modo de fallo | Token caducado → 400 | Expiración |
| Modo de fallo | Token inventado → 400 | |
| Modo de fallo | Ya cubierto: si falla el cambio, el token sigue valiendo (`test_error_handling.py`) | |

### `POST /auth/change-password` — `tests/test_change_password.py`
| Tipo | Caso | Por qué |
|---|---|---|
| Camino feliz | Contraseña actual correcta → login con la nueva funciona y con la vieja no | |
| Caso límite | Nueva contraseña de menos de 8 caracteres → rechazada y la actual sigue valiendo | |
| Caso límite | Cambiar la contraseña invalida un enlace de recuperación pedido antes | Regla de negocio de AUTH-03 |
| Modo de fallo | Contraseña actual incorrecta → 400 y la contraseña no cambia | |
| Modo de fallo | Sin token → 401 | |

## Casos identificados con ayuda de la IA

Candidatos encontrados al revisar el código antes de escribir los tests:

1. **Token JWT sin `exp`**: `jwt.decode` de python-jose no exige `exp` por defecto, así que un token firmado sin fecha de caducidad se acepta para siempre. Solo es explotable si alguien tiene el `SECRET_KEY`, pero choca con la regla de que todo token caduca. → **Confirmado y corregido** (ver "Bugs detectados por la batería").
2. **Cambiar la contraseña no invalida los JWT ya emitidos**: el token antiguo sigue sirviendo hasta que caduca (30 min). Es una limitación de los JWT sin estado; se documenta como conocida, no se corrige en este ticket. Sin test.
3. **Se permite "cambiar" a la misma contraseña**: decisión de producto pendiente. Sin test hasta que se decida.

Casos límite añadidos durante el trabajo que no estaban en el plan original:

| Suite | Caso | Por qué |
|---|---|---|
| `test_register.py` | Contraseña de exactamente 72 bytes (`"ñ" * 36`) se acepta y permite login | Frontera del caso de 74 bytes: confirma que el límite es `> 72`, no `>= 72` |
| `test_login.py` | Tras un login con más de 72 bytes, la contraseña correcta sigue entrando | El 401 no deja la cuenta en mal estado |
| `test_password_reset.py` | `forgot-password` con el email en mayúsculas envía el enlace al email guardado | Coherencia con el registro y el login |
| `test_password_reset.py` | Un usuario desactivado no recibe enlace (y la respuesta es la misma) | Regla de AUTH-03 que no estaba en la tabla |
| `test_password_reset.py` | Usuario desactivado después de pedir el enlace → el reset falla, el hash no cambia y el token no se gasta | `reset-password` comprueba `is_active`; sin test, un enlace viejo reactivaría el acceso |
| `test_suppliers_api.py` | Cambiar el estado no toca `updated_at` (cambiar la tarifa sí) | `updated_at` es la fecha del último cambio de **tarifa** según el CONTEXT |
| `test_suppliers_api.py` | El cliente no puede fijar `id` ni `updated_at` en el alta | Los genera el sistema |
| `test_profiles_api.py` | `PUT /profiles/me` con `user_id` → rechazado, sin tocar ningún perfil | Impide reasignar un perfil a otro usuario |
| `test_profiles_api.py` | Editar el perfil propio no cambia el de otro usuario; `null` explícito vacía el campo y lo no enviado se conserva | Aislamiento entre usuarios y semántica de `exclude_unset` |
| `__tests__/auth.test.ts` | `exp` igual a "ahora" ya no es válido; `exp` como string no es válido; payload base64url con `-` y `_` se decodifica | Frontera de la comparación estricta, tipo del claim y conversión base64url → base64 |
| `__tests__/auth.test.ts` | El mismo token deja de valer al avanzar el reloj; con `localStorage` que lanza no hay sesión | Dependencia del reloj y almacenamiento bloqueado (modo privado) |
| `__tests__/api.test.ts` | Ningún texto de `statusErrorMessage` contiene el número de status; un `AbortError` no se trata como timeout | Regla "texto fijo, nunca el status"; distinguir cancelación de timeout |
| `__tests__/errors.test.ts` | `toApiError` no copia el `detail` de texto de la API; con dos errores en un campo se queda el primero; entradas de `detail` malformadas no rompen | Regla "nunca el detail de la API" y robustez del parseo |

## Bugs detectados por la batería

### 1. La API aceptaba JWT sin claim `exp` (corregido)

- **Qué pasaba:** `get_current_user` (`app/deps.py`) llamaba a `jwt.decode` sin opciones. python-jose solo valida `exp` si está presente, así que un token firmado con el `SECRET_KEY` correcto y el `sub` de un usuario real pero **sin `exp`** daba 200 en `GET /auth/me` y no caducaba nunca.
- **Test que lo detectó:** `tests/test_token.py::test_me_token_sin_exp_es_401`. Falló contra el código original (`assert 200 == 401`) en el commit `65433eb`, que solo añadía los tests.
- **Arreglo:** commit `2491a37`, `options={"require_exp": True}` en el `jwt.decode` de `app/deps.py`. Tras el arreglo pasa toda la batería.

### `xfail` / `test.failing` pendientes

Ninguno. Ningún otro test reveló un comportamiento que pareciera un bug, así que no queda ningún `xfail` en pytest ni `test.failing` en Jest.

## Resultados de cobertura

Ejecutado el **2026-11-05** en la rama `feature/auth-tests` (Windows, Python 3.12.15, Node 22.22.3).

### `uv run pytest --cov --cov-report=term-missing` (módulo de autenticación, objetivo ≥ 70 %)

```
Name                             Stmts   Miss  Cover   Missing
--------------------------------------------------------------
app\deps.py                         27      4    85%   44-46, 52
app\routers\auth.py                 58      2    97%   78-80
app\security.py                     15      0   100%
app\services\password_reset.py      37      0   100%
app\services\users.py               56      6    89%   48, 69-72, 86, 106
--------------------------------------------------------------
TOTAL                              193     12    94%
============================ 118 passed in 58.77s =============================
```

Sin cubrir: `require_admin` y `require_self_or_admin` (`deps.py`, son de `/users`, fuera del plan), el `except` de `_start_password_reset` cuando falla el envío (`auth.py` 78-80), y en `users.py` `list_users`, el borrado del usuario si falla la creación del perfil y ramas de `update_user`/`delete_user`.

### API-042: `uv run pytest --cov --cov-config=.coveragerc-backoffice --cov-report=term-missing` (objetivo ≥ 60 %)

```
Name                       Stmts   Miss  Cover   Missing
--------------------------------------------------------
app\routers\profiles.py       18      0   100%
app\routers\suppliers.py      56      0   100%
app\services\profiles.py      21      0   100%
--------------------------------------------------------
TOTAL                         95      0   100%
======================= 118 passed in 60.56s (0:01:00) ========================
```

### FE-019 y AUTH-088: `npx jest --coverage` en `uis/backoffice`

```
-------------------|---------|----------|---------|---------|-----------------------------------------------------------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-----------------------------------------------------------------------
All files          |   42.96 |    31.05 |   28.88 |   43.26 |
 account.ts        |      54 |    44.61 |   33.33 |   54.16 | 63-73,86-94,98,106,110,125-130,135-140,148-153
 api.ts            |   71.79 |    67.56 |   66.66 |   68.57 | 22-36
 auth.ts           |     100 |      100 |     100 |     100 |
 incidents.ts      |   30.76 |        6 |   13.33 |   32.32 | 54-60,64-73,78-92,222-230,266-272,277-321,330-335,339,343,354,368-370
 nexova.ts         |       0 |      100 |       0 |       0 | 11-110
 suppliers.ts      |       0 |        0 |       0 |       0 | 4-112
 useTokenStatus.ts |       0 |      100 |       0 |       0 | 3-16
-------------------|---------|----------|---------|---------|-----------------------------------------------------------------------

Test Suites: 3 passed, 3 total
Tests:       51 passed, 51 total
```

El porcentaje global es bajo porque cuenta todo `lib/`: lo que hace peticiones (`apiFetch`, `request`, los clientes de la API) no entra en FE-019. `auth.ts` está al 100 %.

## Suites

**pytest (`services/api/tests/`), nuevas en AUTH-088 y API-042:**

- `test_login.py`: qué credenciales obtienen token en `POST /auth/login` y que el token lleva el `sub` del usuario y caduca a su hora.
- `test_token.py`: qué JWT acepta `get_current_user` vía `GET /auth/me` (caducado, sin `exp`, sin `sub`, otra clave, malformado, usuario borrado o desactivado).
- `test_register.py`: alta en `POST /users`: rol, estado, hash de la contraseña, email en minúsculas y límites de longitud.
- `test_password_reset.py`: `forgot-password` + `reset-password` con el envío sustituido: quién recibe enlace y cuándo sirve (último, un solo uso, caducado, inventado, usuario desactivado).
- `test_change_password.py`: `POST /auth/change-password`: cambio correcto, rechazos que no cambian nada e invalidación de enlaces pendientes.
- `test_suppliers_api.py`: CRUD de `/suppliers`: validación de negocio (moneda por país, tarifa > 0), filtros, `updated_at` solo con la tarifa, 404 y 401.
- `test_profiles_api.py`: `/profiles/me`: el perfil es el del token, actualización parcial, `null` explícito, aislamiento entre usuarios, 404 y 401.

**Ya existentes:** `test_users_api.py` (409 neutros), `test_error_handling.py` (422 sin `input`, registros corruptos, CSV, token de reset que no se gasta), `test_database.py`, `test_incident_model.py`, `test_incidents_api.py` y `test_seed.py` (gestor de incidencias).

**Jest (`uis/backoffice/__tests__/`):**

- `auth.test.ts`: `getToken`, `setToken`, `clearToken` e `isTokenValid` de `lib/auth.ts`, con `localStorage` que lanza y `Date.now` controlado.
- `api.test.ts`: `failedRequestStatus` y `statusErrorMessage` de `lib/api.ts`.
- `errors.test.ts`: `toApiError` y `errorMessage` (`lib/account.ts`) y `analyzerErrorMessage` (`lib/incidents.ts`).
