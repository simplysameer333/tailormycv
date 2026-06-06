"""Template quality scoring — give every CV template a real CV-Score.

A template's quality is its CV-Score *ceiling*: render a fixed, strong "gold"
résumé into the template, strip it to text, and run the SAME `check_resume`
CV-Score the user sees on upload. Templates with poor structure / ATS-hostile
layout / cramped page budgets score lower — that becomes the number shown on
each template card, and drives which tier may use it (high-quality templates are
reserved for paying tiers).

This is an ADMIN / offline computation (not per-user), so the LLM cost is paid
once per template, not per resume. Results are stored on the `cv_templates` doc.

The Mustache renderer here is a minimal logic-less subset matching the template
placeholder contract ({{var}}, {{{var}}}, {{#section}}/{{/section}}, {{^x}}, {{.}}).
"""
from __future__ import annotations

import html as _htmllib
import re

# ── Minimal logic-less Mustache renderer ────────────────────────────────────────
_SECTION = re.compile(r"\{\{([#^])\s*([\w.]+)\s*\}\}(.*?)\{\{/\s*\2\s*\}\}", re.DOTALL)
_TRIPLE = re.compile(r"\{\{\{\s*([\w.]+)\s*\}\}\}")
_VAR = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def _lookup(ctx: dict, key: str):
    if key == ".":
        return ctx.get(".", "")
    return ctx.get(key, "")


def _render(template: str, ctx: dict) -> str:
    def section(m: re.Match) -> str:
        typ, key, inner = m.group(1), m.group(2), m.group(3)
        val = _lookup(ctx, key)
        if typ == "#":
            if isinstance(val, list):
                parts = []
                for item in val:
                    child = {**ctx, **item} if isinstance(item, dict) else {**ctx, ".": item}
                    parts.append(_render(inner, child))
                return "".join(parts)
            if val:
                child = {**ctx, **val} if isinstance(val, dict) else ctx
                return _render(inner, child)
            return ""
        # inverted: render when falsy/empty
        if not val or (isinstance(val, list) and len(val) == 0):
            return _render(inner, ctx)
        return ""

    out = _SECTION.sub(section, template)
    out = _TRIPLE.sub(lambda m: str(_lookup(ctx, m.group(1))), out)
    out = _VAR.sub(lambda m: _htmllib.escape(str(_lookup(ctx, m.group(1)))), out)
    return out


def _html_to_text(html: str) -> str:
    """Strip a rendered template down to the readable résumé text CV-Score reads."""
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"</(p|div|li|h[1-6]|tr|section)>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    text = _htmllib.unescape(html)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return "\n".join(line.strip() for line in text.splitlines()).strip()


# ── Gold résumé — a deliberately strong CV used to measure each template ─────────
# Quantified, well-structured, complete sections. Holds the content constant so
# score differences reflect the TEMPLATE (structure / ATS / page budget), not the
# content. Matches the placeholder contract used by the templates.
GOLD_CONTEXT: dict = {
    "name": "Jordan A. Mitchell",
    "title": "Senior Software Engineer",
    "email": "jordan.mitchell@email.com",
    "phone": "+44 7700 900123",
    "location": "London, UK",
    "linkedin": "linkedin.com/in/jordanmitchell",
    "contact": "jordan.mitchell@email.com · +44 7700 900123 · London, UK · linkedin.com/in/jordanmitchell",
    "summary": (
        "Senior Software Engineer with 9 years building high-throughput payment platforms in "
        "fintech. Led a team of 6 to ship a real-time fraud engine that cut chargebacks 38%. "
        "Specialises in distributed systems, Python and AWS, with a track record of scaling "
        "services to 50M+ daily transactions."
    ),
    "skillsJoined": "Python · Go · AWS · Kubernetes · PostgreSQL · Kafka · Terraform · System Design · CI/CD · Microservices",
    "experience": [
        {
            "title": "Senior Software Engineer", "company": "Stripe", "date": "2020 — Present",
            "bullets": [
                "Led a team of 6 engineers to build a real-time fraud-detection engine, reducing chargebacks by 38% and saving £2.4M annually.",
                "Re-architected the payments ledger to handle 50M+ daily transactions at 99.99% uptime, cutting p99 latency by 45%.",
                "Drove adoption of event-driven microservices across 4 teams, shrinking deployment time from 2 hours to 8 minutes.",
                "Mentored 5 mid-level engineers, 3 of whom were promoted within 18 months.",
            ],
        },
        {
            "title": "Software Engineer", "company": "Monzo", "date": "2017 — 2020",
            "bullets": [
                "Built a card-authorisation service in Go processing 12M transactions/day with sub-50ms latency.",
                "Reduced cloud infrastructure spend by 31% (£480K/yr) by consolidating workloads onto Kubernetes.",
                "Implemented automated regression testing that caught 90% of defects before release.",
            ],
        },
        {
            "title": "Junior Developer", "company": "Sage", "date": "2015 — 2017",
            "bullets": [
                "Delivered 20+ features for an accounting SaaS used by 200K SMBs.",
                "Cut page load times 40% by optimising SQL queries and adding Redis caching.",
            ],
        },
    ],
    "skills": [{".": s} for s in
               ["Python", "Go", "AWS", "Kubernetes", "PostgreSQL", "Kafka", "Terraform", "System Design", "CI/CD", "Microservices"]],
    "hasEducation": True,
    "education": [
        {"degree": "BSc (Hons) Computer Science, First Class", "school": "University of Manchester", "year": "2015"},
    ],
    "extraSections": [
        {"name": "Certifications", "title": "Certifications",
         "itemsJoined": "AWS Certified Solutions Architect – Professional · Certified Kubernetes Administrator (CKA)"},
    ],
    "accentColor": "#1d4ed8",
}


def render_gold_text(html: str) -> str:
    """Render the gold résumé into a template's HTML and return readable text."""
    return _html_to_text(_render(html, GOLD_CONTEXT))


def tier_for_score(score: int) -> str:
    """Map a template quality score to the minimum tier allowed to use it.

    High-quality templates are reserved for paying tiers (the monetisation lever):
      >= 85  → pro only
      78–84  → plus and pro
      < 78   → all tiers (free)
    """
    if score >= 85:
        return "pro"
    if score >= 78:
        return "plus"
    return "free"


async def score_template_html(html: str, anthropic_key: str) -> int:
    """Render the gold résumé into the template and return its CV-Score (0–100)."""
    from services.resume_checker_service import check_resume
    text = render_gold_text(html)
    result = await check_resume(text, anthropic_key)
    return int(result.get("overall_score", 0) or 0)
