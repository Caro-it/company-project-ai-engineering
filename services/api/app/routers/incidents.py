from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from incidents_core.analysis import analyze_rows
from incidents_core.constants import RULES
from incidents_core.export import summary_to_csv
from incidents_core.validation import parse_rows

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Último análisis en memoria (se pierde al reiniciar el servidor)
_last_summary: dict | None = None


@router.post("/analyze")
async def analyze_incidents(file: UploadFile = File(...)) -> dict:
    global _last_summary

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="El fichero debe tener extensión .csv.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El fichero está vacío.")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El fichero supera el tamaño máximo de 50 MB.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="El fichero no está codificado en UTF-8.") from None

    try:
        rows = parse_rows(text)
    except ValueError as error:
        # Los mensajes de parse_rows nunca incluyen datos de registros
        raise HTTPException(status_code=422, detail=str(error)) from None

    summary = analyze_rows(rows)
    _last_summary = summary

    return {
        "filename": file.filename,
        "summary": summary,
        "invalid_rule_labels": RULES,
    }


@router.get("/results/export")
def export_results() -> Response:
    if _last_summary is None:
        raise HTTPException(
            status_code=404,
            detail="Todavía no hay ningún análisis. Sube un CSV primero.",
        )
    return Response(
        content=summary_to_csv(_last_summary),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="results.csv"'},
    )