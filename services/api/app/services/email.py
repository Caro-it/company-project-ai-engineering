"""Envío de emails con Resend.

No captura los errores del SDK: quien llama decide qué hacer con ellos.
"""
import logging
from html import escape

import resend

from app.config import settings

logger = logging.getLogger(__name__)

_RESET_SUBJECT = "Restablece tu contraseña de Nexova"


def _reset_text(reset_url: str, minutes: int) -> str:
    return (
        "Hola:\n\n"
        "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Nexova.\n"
        "Abre este enlace para elegir una nueva:\n\n"
        f"{reset_url}\n\n"
        f"El enlace caduca en {minutes} minutos y solo se puede usar una vez.\n"
        "Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.\n\n"
        "Nexova Solutions\n"
    )


def _reset_html(reset_url: str, minutes: int) -> str:
    url = escape(reset_url, quote=True)
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_RESET_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="background:#001D4A;padding:20px 24px;border-radius:8px 8px 0 0;">
<p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;">Nexova</p>
</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5;">
<p style="margin:0 0 16px;">Hola:</p>
<p style="margin:0 0 16px;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Nexova.</p>
<p style="margin:0 0 24px;text-align:center;">
<a href="{url}" style="display:inline-block;background:#ECA400;color:#001D4A;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:6px;">Elegir una nueva contraseña</a>
</p>
<p style="margin:0 0 16px;font-size:14px;color:#475569;">Si el botón no funciona, copia este enlace en tu navegador:<br>
<a href="{url}" style="color:#006992;word-break:break-all;">{url}</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#475569;">El enlace caduca en {minutes} minutos y solo se puede usar una vez.</p>
<p style="margin:0;font-size:14px;color:#475569;">Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""


def send_password_reset_email(to: str, reset_url: str) -> None:
    """Envía el enlace de recuperación. Sin RESEND_API_KEY solo deja un aviso en los logs."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY no está configurada: no se envía el email de recuperación")
        return

    minutes = settings.RESET_TOKEN_EXPIRE_MINUTES
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": _RESET_SUBJECT,
        "html": _reset_html(reset_url, minutes),
        "text": _reset_text(reset_url, minutes),
    })
