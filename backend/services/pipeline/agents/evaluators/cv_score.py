"""CV-Score evaluator — scores the generated résumé with the SAME engine users see.

This is the unification: instead of a separate JD-alignment rubric, the builder
loop evaluates each draft with `check_resume` — the exact CV-Score shown on
upload and on the score page. So "the builder must reach 80" and "the user sees
80" are now the same number. It also uses Haiku (cheap) and is a single call per
cycle, so it replaces the 3-evaluator panel at lower cost.

The evaluator returns the CV-Score as `score` and the weak-category improvement
hints as `suggestions`, which the aggregator turns into the next cycle's feedback.

Patch-key selection is relevance-weighted: weak categories are ranked by a combined
score of (100 - category_score) + jd_weight * 0.5, where jd_weight counts how many
JD-specific keywords for that category appear in the job description. This biases
feedback toward sections that are BOTH weak AND highly relevant to the specific JD,
so the generator spends its next cycle on the highest-impact improvements.
"""
from __future__ import annotations

from .base import BaseEvaluatorAgent
from config import settings

# Maps each CV-Score category key to JD keyword signals for that section.
# A higher hit count means the JD cares more about that section → apply a
# relevance boost so the section ranks higher in the feedback even when its
# raw CV-score gap is similar to other sections.
_SECTION_JD_KEYWORDS: dict[str, list[str]] = {
    "experience": [
        "experience", "worked", "managed", "led", "delivered", "drove",
        "built", "launched", "owned", "responsible", "background",
        "track record", "proven", "demonstrated",
    ],
    "skills": [
        "proficient", "knowledge of", "familiar with", "expertise",
        "technical skills", "stack", "technologies", "tools", "frameworks",
        "languages", "platforms",
    ],
    "summary": [
        "summary", "profile", "about you", "who you are", "objective",
        "overview", "introduction",
    ],
    "ats": [
        "keyword", "ats", "applicant tracking", "search", "matching",
        "screening", "filter",
    ],
    "education": [
        "degree", "bachelor", "master", "phd", "mba", "qualification",
        "certified", "certification", "accredited", "graduate",
    ],
    "contact": [
        "linkedin", "portfolio", "github", "location", "remote", "hybrid",
        "on-site", "relocation",
    ],
    "design": [
        "format", "layout", "presentation", "one page", "two page",
        "concise", "clear", "structured",
    ],
}


def _jd_section_boost(category_key: str, job_description: str) -> int:
    """Count JD keyword hits for a given CV-Score category key.

    Returns a non-negative integer. Used as a tie-breaker / boost when ranking
    weak categories: a section that is weak AND heavily signalled by the JD
    should be addressed first in the next generator cycle.
    """
    if not job_description:
        return 0
    jd_lower = job_description.lower()
    keywords = _SECTION_JD_KEYWORDS.get(category_key, [])
    return sum(1 for kw in keywords if kw in jd_lower)


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
            # Re-rank by relevance-weighted priority: sections that are weak AND
            # heavily signalled by the JD surface first in the feedback prompt so
            # the generator addresses them on the next cycle.
            # Sort key: higher combined score = higher priority.
            #   base_gap   = 100 - category_score  (0–100, larger = weaker)
            #   jd_weight  = keyword hits in the JD (0–N, larger = more JD-relevant)
            #   combined   = base_gap + jd_weight * 0.5
            # This preserves the existing score-based ordering when the JD adds no
            # signal (jd_weight=0 for all), and boosts JD-relevant sections otherwise.
            weak.sort(
                key=lambda c: (100 - c["score"]) + _jd_section_boost(c["key"], job_description) * 0.5,
                reverse=True,
            )
            suggestions = [
                f"[{c['name']}] {imp}"
                for c in weak
                for imp in c["improvements"][:2]
            ]
            # Per-category scores ride along into eval_history / session / audit —
            # the diagnostic data that says WHICH category blocks the tier bar.
            categories = [
                {"key": c.get("key", ""), "name": c.get("name", ""), "score": int(c.get("score", 0) or 0)}
                for c in (result.get("categories") or []) if isinstance(c, dict)
            ]
            return {"model": self.name, "score": score, "suggestions": suggestions[:8],
                    "categories": categories}
        except Exception as exc:
            return {"model": self.name, "score": None, "suggestions": [f"CV-Score error: {exc}"]}
