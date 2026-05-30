"""Export router — generates DOCX and PDF using pure Python (no LibreOffice)."""
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from bson import ObjectId
from pydantic import BaseModel
from datetime import datetime
from database import get_db, get_fs
from dependencies.auth import get_optional_user
from services.file_generator import generate_docx, generate_pdf
from services.template_service import get_template_path

router = APIRouter()


class ExportBody(BaseModel):
    include_pdf: bool = False
    resume_data: dict | None = None  # fallback when session lacks generated_resume
    bold_keywords: bool = True        # bold key skills extracted from JD in the output


@router.post("/export")
async def export_resume(
    session_id: str,
    body: ExportBody = ExportBody(),
    user: dict | None = Depends(get_optional_user),
):
    db = get_db()
    fs = get_fs()
    session = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(404, "Session not found.")

    resume_data = session.get("generated_resume") or body.resume_data
    if not resume_data:
        raise HTTPException(422, "No generated resume in session. Run /generate first.")
    if not session.get("generated_resume") and resume_data:
        await db.sessions.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"generated_resume": resume_data}},
        )

    template_id = session.get("selected_template_id")
    template_path = ""
    if template_id:
        tmpl = await db.templates.find_one({"_id": ObjectId(template_id)})
        if tmpl:
            template_path = get_template_path(tmpl["file_path"])

    if body.include_pdf:
        from services.tier_config_service import has_feature as _hf
        if not _hf((user or {}).get("tier", "free"), "pdf_export"):
            raise HTTPException(403, "PDF export is not available on your plan. Visit /settings/plan to upgrade.")

    # Resolve key_skills for bold-keyword rendering
    bold_keywords: list[str] = []
    if body.bold_keywords:
        bold_keywords = session.get("key_skills") or []

    output_files = {}

    # DOCX is always generated — it is the primary output.
    docx_bytes = generate_docx(resume_data, template_path, bold_keywords=bold_keywords)
    docx_id = await fs.upload_from_stream(
        f"resume_{session_id}.docx",
        io.BytesIO(docx_bytes),
        metadata={"session_id": session_id, "uploadDate": datetime.utcnow()},
    )
    output_files["docx_file_id"] = str(docx_id)

    # PDF is optional — generated directly from resume data (no LibreOffice needed).
    if body.include_pdf:
        try:
            pdf_bytes = generate_pdf(resume_data, bold_keywords=bold_keywords)
            pdf_id = await fs.upload_from_stream(
                f"resume_{session_id}.pdf",
                io.BytesIO(pdf_bytes),
                metadata={"session_id": session_id, "uploadDate": datetime.utcnow()},
            )
            output_files["pdf_file_id"] = str(pdf_id)
        except Exception as e:
            import traceback
            traceback.print_exc()
            output_files["pdf_error"] = str(e)

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"output_files": output_files}},
    )

    return output_files



@router.get("/download/{file_id}")
async def download_file(file_id: str, filename: str = "resume"):
    fs = get_fs()
    try:
        grid_out = await fs.open_download_stream(ObjectId(file_id))
    except Exception:
        raise HTTPException(404, "File not found.")

    content = await grid_out.read()
    fname = grid_out.filename or filename
    media_type = "application/pdf" if fname.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
