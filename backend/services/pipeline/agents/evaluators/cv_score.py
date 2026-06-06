"""CV-Score evaluator — scores the generated résumé with the SAME engine users see.

This is the unification: instead of a separate JD-alignment rubric, the builder
loop evaluates each draft with `check_resume` — the exact CV-Score shown on
upload and on the score page. So "the builder must reach 80" and "the user sees
80" are now the same number. It also uses Haiku (cheap) and is a single call per
cycle, so it replaces the 3-evaluator panel at lower cost.

The evaluator returns the CV-Score as `score` and the weak-category improvement
hints as `suggestions`, which the aggregator turns into the next cycle's feedback.
"""
from __future__ import annotations

from .base import BaseEvaluatorAgent
from config import settings


def resume_json_to_text(rj: dict) -> str:
    """Serialise the generated résumé JSON to plain text for CV-Score.

    Mirrors the generator's output schema:
      {name, contact{...}, summary, experience[{company,role,dates,bullets[]}],
       education[{institution,degree,dates}], sections[{title,items[]}]}
    """
    if not isinstance(rj, dict):
        return ""
    lines: list[str] = []
    if rj.get("name"):
        lines.append(str(rj["name"]))
    c = rj.get("contact") or {}
    if isinstance(c, dict):
        bits = [str(c.get(k, "")) for k in ("email", "phone", "location", "linkedin", "github", "website")]
        bits = [b for b in bits if b]
        if bits:
            lines.append(" · ".join(bits))
    if rj.get("summary"):
        lines += ["", "Professional Summary", str(rj["summary"])]
    exp = rj.get("experience") or []
    if exp:
        lines += ["", "Experience"]
        for e in exp:
            if not isinstance(e, dict):
                continue
            head = " · ".join(str(e.get(k, "")) for k in ("role", "company", "dates") if e.get(k))
            if head:
                lines.append(head)
            for b in (e.get("bullets") or []):
                lines.append(f"- {b}")
    edu = rj.get("education") or []
    if edu:
        lines += ["", "Education"]
        for e in edu:
            if not isinstance(e, dict):
                continue
            head = " · ".join(str(e.get(k, "")) for k in ("degree", "institution", "dates") if e.get(k))
            if head:
                lines.append(head)
    for s in (rj.get("sections") or []):
        if not isinstance(s, dict):
            continue
        title, items = s.get("title", ""), s.get("items") or []
        if title or items:
            lines += ["", str(title)]
            for it in items:
                lines.append(f"- {it}")
    return "\n".join(lines).strip()


class CvScoreEvaluatorAgent(BaseEvaluatorAgent):
    """Evaluator that scores a draft with the user-facing CV-Score engine."""

    name = "cv_score"

    @property
    def is_configured(self) -> bool:
        return bool(settings.anthropic_api_key)

    async def run(self, resume_json: dict, job_description: str, profession_config: dict,
                  source_resume_text: str = "") -> dict:
        from services.resume_checker_service import check_resume, extract_weak_categories
        try:
            text = resume_json_to_text(resume_json)
            result = await check_resume(text, settings.anthropic_api_key)
            score = int(result.get("overall_score", 0) or 0)
            # Feedback = improvement hints from weak categories, shared with the
            # refinement loop via extract_weak_categories for consistency.
            weak = extract_weak_categories(result)
            suggestions = [
                f"[{c['name']}] {imp}"
                for c in weak
                for imp in c["improvements"][:2]
            ]
            return {"model": self.name, "score": score, "suggestions": suggestions[:8]}
        except Exception as exc:
            return {"model": self.name, "score": None, "suggestions": [f"CV-Score error: {exc}"]}
