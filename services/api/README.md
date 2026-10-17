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

La lógica de validación y métricas vive en `packages/incidents_core` y es la misma que usa `scripts/analyze.py`.
