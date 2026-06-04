"""CV template service — CRUD over the `cv_templates` collection + the AI template
generator.

AI-engineering practice baked in (see memory: project-ai-engineering-standards):
  • Evals      — `validate_template_html` / `normalize_docx_config` gate every
                 generation BEFORE it can be saved (pure, unit-testable).
  • Context    — one focused system prompt stating the exact placeholder contract
                 + a single reference template (few-shot). One call, one purpose.
  • Optimize   — static system prompt sent with Anthropic prompt caching
                 (`cache_control`); bounded max_tokens; low temperature.
  • Monitoring — structured telemetry log per generation (model, latency, tokens,
                 validation result).
"""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime

from anthropic import AsyncAnthropic

from config import settings
from services.cv_template_seed_data import BUILTIN_TEMPLATES

logger = logging.getLogger("tailormycv.cv_templates")

# Generation uses a capable model — authoring HTML/CSS is a creative task.
_GEN_MODEL = settings.anthropic_evaluator_model  # Sonnet


# ══════════════════════════════════════════════════════════════════════════════
# Allowed docx_config vocabulary (the renderers in docx_templates.py understand)
# ══════════════════════════════════════════════════════════════════════════════

_LAYOUTS = {"single", "sidebar", "two-equal", "left-bar"}
_HEADERS = {"centered", "banner", "serif-centered", "left"}
_HEADINGS = {"rule", "colored", "left-border", "double-rule", "gold-rule", "circle-marker"}
_FONTS = {"Calibri", "Times New Roman", "Georgia", "Courier New"}

_DEFAULT_DOCX = {
    "accent": "1f2937", "header": "centered", "font": "Calibri", "heading": "rule",
    "compact": False, "layout": "single", "sidebar_color": "", "sidebar_ratio": 0.0,
    "banner_bg": "",
}

# ══════════════════════════════════════════════════════════════════════════════
# EVALS — validation gate (pure functions, no I/O → unit-testable)
# ══════════════════════════════════════════════════════════════════════════════

# A valid template must cover each of these (so it renders a real resume). Each
# requirement is satisfied by ANY of its alternative placeholders — e.g. skills
# may be rendered as an iterated list ({{#skills}}) or the pre-joined string.
REQUIRED_PLACEHOLDERS: list[tuple[str, list[str]]] = [
    ("name", ["{{name}}"]),
    ("summary", ["{{summary}}"]),
    ("experience", ["{{#experience}}"]),
    ("skills", ["{{#skills}}", "{{skillsJoined}}"]),
]

_SECTION_TOK = re.compile(r"\{\{([#^/])\s*([\w.]+)\s*\}\}")


def _unbalanced_sections(html: str) -> list[str]:
    """Ensure every {{#x}}/{{^x}} has a matching {{/x}} in the right order."""
    stack: list[str] = []
    for sig, key in _SECTION_TOK.findall(html):
        if sig in "#^":
            stack.append(key)
        else:  # closing
            if not stack or stack[-1] != key:
                return [f"Unbalanced Mustache section near {{{{/{key}}}}}."]
            stack.pop()
    if stack:
        return [f"Unclosed Mustache section {{{{#{stack[-1]}}}}}."]
    return []


def validate_template_html(html: str) -> list[str]:
    """Return a list of problems (empty list = valid). The save path rejects any
    generation/edit that fails this gate."""
    errs: list[str] = []
    if not html or len(html.strip()) < 50:
        return ["HTML is empty or too short."]
    low = html.lower()
    if "<html" not in low or "</html>" not in low:
        errs.append("Not a complete standalone HTML document (<html>…</html> required).")
    if "<body" not in low:
        errs.append("Missing <body> element.")
    for label, alts in REQUIRED_PLACEHOLDERS:
        if not any(a in html for a in alts):
            errs.append(f"Missing a placeholder for {label} ({' or '.join(alts)}).")
    errs += _unbalanced_sections(html)
    return errs


def normalize_docx_config(cfg: dict | None) -> dict:
    """Coerce an arbitrary config dict to the allowed vocabulary, filling any
    invalid/missing field with the safe default."""
    cfg = cfg or {}

    def pick(key: str, allowed: set[str]) -> str:
        v = str(cfg.get(key) or "").strip()
        return v if v in allowed else _DEFAULT_DOCX[key]

    try:
        ratio = float(cfg.get("sidebar_ratio") or 0.0)
    except (TypeError, ValueError):
        ratio = 0.0
    return {
        "accent": (str(cfg.get("accent") or _DEFAULT_DOCX["accent"]).lstrip("#") or _DEFAULT_DOCX["accent"]),
        "header": pick("header", _HEADERS),
        "font": pick("font", _FONTS),
        "heading": pick("heading", _HEADINGS),
        "compact": bool(cfg.get("compact", False)),
        "layout": pick("layout", _LAYOUTS),
        "sidebar_color": str(cfg.get("sidebar_color") or "").lstrip("#"),
        "sidebar_ratio": max(0.0, min(0.6, ratio)),
        "banner_bg": str(cfg.get("banner_bg") or "").lstrip("#"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONTEXT ENGINEERING — the generator prompt (placeholder contract + reference)
# ══════════════════════════════════════════════════════════════════════════════

_REFERENCE_HTML = next(t["html"] for t in BUILTIN_TEMPLATES if t["key"] == "Horizon")

_GEN_SYSTEM = """You are a senior resume-template designer. You author a SINGLE, \
complete, standalone HTML resume template that renders a candidate's CV.

OUTPUT CONTRACT — return ONLY minified JSON (no markdown fence) of the exact shape:
{
  "html": "<!DOCTYPE html>… a COMPLETE standalone document …</html>",
  "docx_config": { "accent": "1d4ed8", "header": "banner", "font": "Calibri",
     "heading": "rule", "compact": false, "layout": "single",
     "sidebar_color": "", "sidebar_ratio": 0.0, "banner_bg": "" },
  "suggested_metadata": { "name": "...", "category": "Modern", "traits": ["..","..",".."],
     "bestFor": "...", "description": "...", "pages": 2, "accentColor": "#1d4ed8" }
}

HTML RULES (logic-less Mustache placeholders — DO NOT invent new ones):
- Document MUST be a full <html>…</html> with an inline <style>; width:794px body; A4-friendly.
- Scalars: {{name}} {{title}} {{email}} {{phone}} {{location}} {{linkedin}} {{contact}} {{summary}} {{nameInitial}}
- Skills: {{#skills}}…{{.}}…{{/skills}}   or   {{skillsJoined}} (pre-joined with '  ·  ')
- Experience: {{#experience}} {{title}} {{company}} {{date}} {{#bullets}}…{{.}}…{{/bullets}} {{/experience}}
- Education (guard with hasEducation): {{#hasEducation}}{{#education}} {{degree}} {{school}} {{year}} {{/education}}{{/hasEducation}}
- Extra sections: {{#highlights}} / {{#compactSections}} / {{#longformSections}} / {{#extraSections}}
    each item: {{title}}, {{#items}}{{.}}{{/items}}, {{itemsJoined}}
- Every {{#x}} MUST be closed by {{/x}}. Use {{name}} (auto HTML-escaped); never raw user HTML.
- Wrap summary text in <div class="prose">…</div>; put each experience bullet in an <li>.

docx_config RULES (enum vocabulary the DOCX renderer understands):
- layout ∈ single|sidebar|two-equal|left-bar ; header ∈ centered|banner|serif-centered|left
- heading ∈ rule|colored|left-border|double-rule|gold-rule|circle-marker
- font ∈ Calibri|Times New Roman|Georgia|Courier New ; accent/sidebar_color/banner_bg = 6-hex, no '#'
- Pick values that best approximate your HTML design.

REFERENCE (a valid template you can learn structure from — do NOT copy verbatim):
""" + _REFERENCE_HTML


def _system_blocks() -> list[dict]:
    # Prompt caching: the system prompt is large + static → cache it.
    return [{"type": "text", "text": _GEN_SYSTEM, "cache_control": {"type": "ephemeral"}}]


class TemplateGenerationError(Exception):
    """Raised when generation fails or the output fails the eval gate."""


async def generate_template(prompt: str, base_html: str | None = None) -> dict:
    """One dedicated LLM call: author a single template artifact.
    Returns {html, docx_config, suggested_metadata}; raises TemplateGenerationError
    on a failed eval gate."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    user = f"Design instructions:\n{prompt.strip()}"
    if base_html:
        user += (
            "\n\nEDIT MODE — start from this existing template and modify per the "
            "instructions, keeping the same placeholder contract:\n" + base_html
        )

    t0 = time.monotonic()
    message = await client.messages.create(
        model=_GEN_MODEL,
        max_tokens=8000,
        temperature=0.4,
        system=_system_blocks(),
        messages=[{"role": "user", "content": user}],
    )
    latency_ms = int((time.monotonic() - t0) * 1000)

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.warning("cv_template.generate parse_error latency_ms=%s err=%s", latency_ms, e)
        raise TemplateGenerationError("Model did not return valid JSON. Try again or refine the prompt.")

    html = str(data.get("html") or "")
    errors = validate_template_html(html)

    usage = getattr(message, "usage", None)
    # ── Monitoring: structured telemetry for every generation ────────────────────
    logger.info(
        "cv_template.generate model=%s latency_ms=%s in_tok=%s out_tok=%s "
        "cache_read=%s valid=%s errors=%s",
        _GEN_MODEL, latency_ms,
        getattr(usage, "input_tokens", "?"), getattr(usage, "output_tokens", "?"),
        getattr(usage, "cache_read_input_tokens", "?"),
        not errors, errors or "-",
    )

    if errors:
        raise TemplateGenerationError("Generated template failed validation: " + "; ".join(errors))

    return {
        "html": html,
        "docx_config": normalize_docx_config(data.get("docx_config")),
        "suggested_metadata": data.get("suggested_metadata") or {},
    }


# ══════════════════════════════════════════════════════════════════════════════
# CRUD + seed
# ══════════════════════════════════════════════════════════════════════════════

_PUBLIC_FIELDS = (
    "key", "name", "category", "traits", "bestFor", "description", "pages", "tier",
    "accentColor", "html", "docx_config", "source", "is_active", "show_in_cv_score",
    "sort_order",
)


def _serialize(doc: dict) -> dict:
    return {k: doc.get(k) for k in _PUBLIC_FIELDS}


async def seed_cv_templates(db) -> int:
    """Idempotent — insert any built-in template whose key is missing. Preserves
    admin edits to existing rows."""
    now = datetime.utcnow()
    inserted = 0
    for i, t in enumerate(BUILTIN_TEMPLATES):
        if await db.cv_templates.find_one({"key": t["key"]}):
            continue
        await db.cv_templates.insert_one({
            **t,
            "docx_config": normalize_docx_config(t.get("docx_config")),
            "source": "builtin",
            "is_active": True,
            "sort_order": i,
            "created_at": now,
            "updated_at": now,
        })
        inserted += 1
    if inserted:
        logger.info("cv_template.seed inserted=%s", inserted)
    return inserted


async def list_cv_templates(db, *, active_only: bool = True) -> list[dict]:
    q = {"is_active": {"$ne": False}} if active_only else {}
    docs = await db.cv_templates.find(q).sort("sort_order", 1).to_list(length=500)
    return [_serialize(d) for d in docs]


async def get_cv_template(db, key: str) -> dict | None:
    doc = await db.cv_templates.find_one({"key": key})
    return _serialize(doc) if doc else None


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or "template").lower()).strip("-") or "template"
    return f"{base}-{int(datetime.utcnow().timestamp())}"


async def create_cv_template(db, body: dict) -> dict:
    html = str(body.get("html") or "")
    errors = validate_template_html(html)
    if errors:
        raise TemplateGenerationError("; ".join(errors))

    key = (body.get("key") or "").strip() or _slugify(body.get("name", ""))
    if await db.cv_templates.find_one({"key": key}):
        key = _slugify(body.get("name", key))

    now = datetime.utcnow()
    last = await db.cv_templates.find_one(sort=[("sort_order", -1)])
    doc = {
        "key": key,
        "name": body.get("name") or key,
        "category": body.get("category") or "Modern",
        "traits": body.get("traits") or [],
        "bestFor": body.get("bestFor") or "",
        "description": body.get("description") or "",
        "pages": int(body.get("pages") or 2),
        "tier": body.get("tier") or "plus",
        "accentColor": body.get("accentColor") or "#1d4ed8",
        "html": html,
        "docx_config": normalize_docx_config(body.get("docx_config")),
        "source": body.get("source") or "ai",
        "is_active": bool(body.get("is_active", True)),
        "show_in_cv_score": bool(body.get("show_in_cv_score", False)),
        "sort_order": (last.get("sort_order", 0) + 1) if last else 0,
        "created_at": now,
        "updated_at": now,
    }
    await db.cv_templates.insert_one(doc)
    return _serialize(doc)


_EDITABLE = {
    "name", "category", "traits", "bestFor", "description", "pages", "tier",
    "accentColor", "html", "docx_config", "is_active", "show_in_cv_score", "sort_order",
}


async def update_cv_template(db, key: str, patch: dict) -> dict | None:
    update = {k: v for k, v in patch.items() if k in _EDITABLE}
    if "html" in update:
        errors = validate_template_html(str(update["html"]))
        if errors:
            raise TemplateGenerationError("; ".join(errors))
    if "docx_config" in update:
        update["docx_config"] = normalize_docx_config(update["docx_config"])
    if not update:
        return await get_cv_template(db, key)
    update["updated_at"] = datetime.utcnow()
    res = await db.cv_templates.find_one_and_update(
        {"key": key}, {"$set": update}, return_document=True,
    )
    return _serialize(res) if res else None


async def delete_cv_template(db, key: str) -> bool:
    doc = await db.cv_templates.find_one({"key": key})
    if not doc:
        return False
    if doc.get("source") == "builtin":
        raise TemplateGenerationError("Built-in templates cannot be deleted — deactivate them instead.")
    await db.cv_templates.delete_one({"key": key})
    return True
