"""Public CV-template router — the HTML preview templates (`cv_templates`).

GET /api/cv-templates — active templates (metadata + standalone HTML + docx_config),
used by the frontend runtime store (lib/cvTemplates.ts) to render previews and by
the builder/CV-score galleries.
"""
from __future__ import annotations

from fastapi import APIRouter

from database import get_db
from services.cv_template_service import list_cv_templates

router = APIRouter()


@router.get("/cv-templates")
async def get_cv_templates():
    return await list_cv_templates(get_db(), active_only=True)
