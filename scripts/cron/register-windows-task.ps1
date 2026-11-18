# Script nocturno de telemetría (DEV-53) en Windows: Programador de tareas en vez de crontab.
# Ejecutar una vez en PowerShell desde la raíz del monorepo:
#   powershell -ExecutionPolicy Bypass -File scripts\cron\register-windows-task.ps1
# Ver la tarea:   schtasks /Query /TN "Nexova nightly_export" /V /FO LIST
# Lanzarla ya:    schtasks /Run /TN "Nexova nightly_export"
# Borrarla:       schtasks /Delete /TN "Nexova nightly_export" /F
#
# 03:15 hora de Madrid = 02:15 UTC en invierno (01:15 UTC en verano): el día anterior en
# UTC ya está cerrado en los dos casos. El Programador de tareas usa la hora local.
# uv tiene que estar en el PATH del usuario que ejecuta la tarea.
$wrapper = (Resolve-Path "$PSScriptRoot\nightly_export.cmd").Path
schtasks /Create /F /TN "Nexova nightly_export" /SC DAILY /ST 03:15 /TR "`"$wrapper`""
