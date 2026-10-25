"""Crea el usuario admin inicial o promueve a admin un usuario existente.

Uso (desde services/api):  create-admin   o   python -m app.create_admin
Si el email ya existe, se promueve a admin y se reactiva sin cambiar su contraseña.
Sirve también para recuperar el acceso si un admin se ha quitado su propio rol.
"""
import sys
from getpass import getpass

from pydantic import TypeAdapter, ValidationError

from app.auth_models import Email, Role, UserCreate, UserUpdate
from app.services.users import create_user, get_user_by_email, update_user


def _first_error(error: ValidationError) -> str:
    return error.errors()[0]["msg"]


def main() -> None:
    try:
        email = TypeAdapter(Email).validate_python(input("Email del admin: ").strip())
    except ValidationError as error:
        sys.exit(f"Email no válido: {_first_error(error)}")

    existing = get_user_by_email(email)
    if existing is not None:
        update_user(existing["id"], UserUpdate(role=Role.ADMIN, is_active=True))
        print(f"{email} ya existía: ahora es admin y está activo.")
        return

    password = getpass("Contraseña: ")
    if getpass("Repite la contraseña: ") != password:
        sys.exit("Las contraseñas no coinciden.")

    try:
        data = UserCreate(email=email, password=password)
    except ValidationError as error:
        sys.exit(f"Contraseña no válida: {_first_error(error)}")

    create_user(data, role=Role.ADMIN)
    print(f"Admin {email} creado.")


if __name__ == "__main__":
    main()
