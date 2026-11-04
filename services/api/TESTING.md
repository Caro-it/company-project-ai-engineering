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

_(Se completa durante el desarrollo.)_ Candidatos encontrados al revisar el código:

1. **Token JWT sin `exp`**: `jwt.decode` de python-jose no exige `exp` por defecto, así que un token firmado sin fecha de caducidad se acepta para siempre. Solo es explotable si alguien tiene el `SECRET_KEY`, pero choca con la regla de que todo token caduca. → Posible bug a corregir (`options={"require_exp": True}`) y documentar.
2. **Cambiar la contraseña no invalida los JWT ya emitidos**: el token antiguo sigue sirviendo hasta que caduca (30 min). Es una limitación de los JWT sin estado; se documenta como conocida, no se corrige en este ticket.
3. **Se permite "cambiar" a la misma contraseña**: decisión de producto pendiente.

## Bugs detectados por la batería

_(Se completa durante el desarrollo.)_

## Resultados de cobertura

_(Se completa al final con la salida de `uv run pytest --cov`.)_
