"""Admin router for CV templates (the HTML preview templates).

All endpoints require is_superadmin. Mirrors the patterns in routers/admin.py.

GET    /api/admin/cv-templates          — all templates (incl. inactive)
POST   /api/admin/cv-templates          — create a template
PATCH  /api/admin/cv-templates/{key}    — edit metadata / html / docx_config / flags
DELETE /api/admin/cv-templates/{key}    — delete (non-builtin only)
POST   /api/admin/cv-templates/generate — one LLM call: author a template from a prompt
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies.auth import require_superadmin
from database import get_db
from services.audit import log_audit
from services import cv_template_service as svc

router = APIRouter()


@router.get("/admin/cv-templates")
async def list_all(_: dict = Depends(require_superadmin)):
    return await svc.list_cv_templates(get_db(), active_only=False)


class CvTemplateBody(BaseModel):
    key: str | None = None
    name: str | None = None
    category: str | None = None
    traits: list[str] | None = None
    bestFor: str | None = None
    description: str | None = None
    pages: int | None = None
    tier: str | None = None
    accentColor: str | None = None
    html: str | None = None
    docx_config: dict | None = None
    source: str | None = None
    is_active: bool | None = None
    show_in_cv_score: bool | None = None
    sort_order: int | None = None


@router.post("/admin/cv-templates")
async def create(body: CvTemplateBody, user: dict = Depends(require_superadmin)):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        tmpl = await svc.create_cv_template(get_db(), payload)
    except svc.TemplateGenerationError as e:
        raise HTTPException(422, str(e))
    log_audit(user, "cv_template.create", {"key": tmpl["key"], "name": tmpl["name"]})
    return tmpl


@router.patch("/admin/cv-templates/{key}")
async def update(key: str, body: CvTemplateBody, user: dict = Depends(require_superadmin)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        tmpl = await svc.update_cv_template(get_db(), key, patch)
    except svc.TemplateGenerationError as e:
        raise HTTPException(422, str(e))
    if tmpl is None:
        raise HTTPException(404, "Template not found.")
    log_audit(user, "cv_template.update", {"key": key, "fields": list(patch.keys())})
    return tmpl


@router.delete("/admin/cv-templates/{key}")
async def delete(key: str, user: dict = Depends(require_superadmin)):
    try:
        ok = await svc.delete_cv_template(get_db(), key)
    except svc.TemplateGenerationError as e:
        raise HTTPException(400, str(e))
    if not ok:
        raise HTTPException(404, "Template not found.")
    log_audit(user, "cv_template.delete", {"key": key})
    return {"deleted": key}


class GenerateBody(BaseModel):
    prompt: str
    base_key: str | None = None


@router.post("/admin/cv-templates/generate")
async def generate(body: GenerateBody, user: dict = Depends(require_superadmin)):
    if not body.prompt or not body.prompt.strip():
        raise HTTPException(422, "A prompt is required.")
    base_html = None
    if body.base_key:
        base = await svc.get_cv_template(get_db(), body.base_key)
        base_html = base.get("html") if base else None
    try:
        result = await svc.generate_template(body.prompt, base_html=base_html)
    except svc.TemplateGenerationError as e:
        raise HTTPException(422, str(e))
    log_audit(user, "cv_template.generate", {"base_key": body.base_key, "prompt_len": len(body.prompt)})
    return result
