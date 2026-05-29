from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from datetime import datetime
from database import get_db
from services.template_service import validate_custom_template, get_template_path
import os, aiofiles

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", "uploads")


@router.get("/templates")
async def list_templates():
    db = get_db()
    cursor = db.templates.find({"is_active": {"$ne": False}})
    templates = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        templates.append(doc)
    return templates


@router.post("/templates/upload")
async def upload_custom_template(file: UploadFile = File(...)):
    if not file.filename.endswith(".docx"):
        raise HTTPException(400, "Only .docx template files are accepted.")

    file_bytes = await file.read()
    missing = validate_custom_template(file_bytes)
    if missing:
        raise HTTPException(
            422,
            f"Template is missing required placeholders: {', '.join(missing)}",
        )

    safe_name = f"{datetime.utcnow().timestamp()}_{file.filename}"
    dest = os.path.join(UPLOADS_DIR, safe_name)
    async with aiofiles.open(dest, "wb") as f:
        await f.write(file_bytes)

    db = get_db()
    result = await db.templates.insert_one({
        "name": file.filename.replace(".docx", ""),
        "type": "custom",
        "preview_image_url": "",
        "file_path": f"templates/uploads/{safe_name}",
        "placeholders": [
            "{{NAME}}", "{{EMAIL}}", "{{PHONE}}", "{{LINKEDIN}}",
            "{{LOCATION}}", "{{SUMMARY}}", "{{EXPERIENCE}}",
            "{{EDUCATION}}", "{{SKILLS}}",
        ],
        "created_at": datetime.utcnow(),
    })

    return {"template_id": str(result.inserted_id)}
