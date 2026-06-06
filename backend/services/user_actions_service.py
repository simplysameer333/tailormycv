"""User-actions advisor — tells the user exactly what to provide to push past the threshold.

Pure function: no LLM call, no I/O. Takes the final eval_results + pass_threshold
and returns a structured list of concrete, user-side actions. Called only when the
pipeline exits without meeting the threshold.

Each action has:
  - category:    which CV section it relates to
  - priority:    "critical" | "high" | "medium"
  - action:      what the user should do (imperative sentence)
  - example:     a concrete example where helpful
  - score_impact: rough estimate of points this fix is worth
"""
from __future__ import annotations

# ── Category → user-action mapping ──────────────────────────────────────────
# Keyed by patterns found in suggestion text (lower-cased). Order matters —
# more specific patterns should come before generic ones.

_CONTACT_ACTIONS = [
    {
        "trigger": ["linkedin"],
        "action": "Add your LinkedIn profile URL to your CV",
        "example": "linkedin.com/in/your-name",
        "score_impact": 6,
    },
    {
        "trigger": ["city", "location", "country", "geography"],
        "action": "Add your current city and country to your contact section",
        "example": "Mumbai, India  or  London, UK",
        "score_impact": 5,
    },
    {
        "trigger": ["country code", "phone", "+91", "international"],
        "action": "Add your country dialling code to your phone number",
        "example": "+44 7911 123456  or  +91 99103 46443",
        "score_impact": 3,
    },
]

_EXPERIENCE_ACTIONS = [
    {
        "trigger": ["team size", "team of", "engineers", "managed"],
        "action": "State the size of each team you led or worked in",
        "example": "Led a team of 6 QA engineers  /  Worked in a squad of 12",
        "score_impact": 7,
    },
    {
        "trigger": ["defect", "defects", "detection rate", "zero-defect", "critical"],
        "action": "Add a real defect / quality metric for at least one role",
        "example": "Reduced critical defects escaping to production by 40%  /  0 P1 defects in 18 months",
        "score_impact": 8,
    },
    {
        "trigger": ["test case", "test cases", "coverage", "cases per"],
        "action": "State how many test cases you wrote or executed per release",
        "example": "Authored 350+ test cases per release cycle covering regression, smoke, and UAT",
        "score_impact": 6,
    },
    {
        "trigger": ["release", "releases", "production", "deploy"],
        "action": "Quantify how many releases you delivered or supported per year",
        "example": "Delivered 12 quarterly releases with zero production rollbacks",
        "score_impact": 6,
    },
    {
        "trigger": ["time", "hours", "reduce", "faster", "sla", "cycle time"],
        "action": "Add a time-saving or efficiency metric for at least one project",
        "example": "Reduced regression cycle from 4 days to 6 hours using ALM automation",
        "score_impact": 7,
    },
]

_EDUCATION_ACTIONS = [
    {
        "trigger": ["graduation year", "graduation", "year", "btech", "bachelor"],
        "action": "Add your graduation year to your degree",
        "example": "Bachelor of Technology (Computer Science) — College Name, 2010",
        "score_impact": 5,
    },
    {
        "trigger": ["certification year", "certification date", "valid", "obtained", "istqb", "scrum"],
        "action": "Add the year you obtained each certification",
        "example": "ISTQB Foundation Level (2014)  /  Certified Scrum Master (2018)",
        "score_impact": 4,
    },
]

_SKILLS_ACTIONS = [
    {
        "trigger": ["automation", "selenium", "uft", "cypress", "playwright", "framework"],
        "action": "Confirm whether you have test automation experience and add the tool",
        "example": "Selenium WebDriver (Python)  /  UFT / QTP  /  Cucumber + JUnit",
        "score_impact": 8,
    },
    {
        "trigger": ["modern", "outdated", "legacy", "current"],
        "action": "Replace or label legacy tools with modern equivalents where possible",
        "example": "Replace 'DB2-QMF' with 'SQL Server / PostgreSQL' if applicable",
        "score_impact": 4,
    },
]

_CATEGORY_MAP: dict[str, list[dict]] = {
    "contact information": _CONTACT_ACTIONS,
    "work experience":     _EXPERIENCE_ACTIONS,
    "education":           _EDUCATION_ACTIONS,
    "skills":              _SKILLS_ACTIONS,
}

_PRIORITY_MAP = {
    "contact information": "critical",
    "work experience":     "critical",
    "education":           "high",
    "skills":              "high",
}


def _match_actions(category_name: str, suggestions: list[str]) -> list[dict]:
    """Return user actions triggered by the suggestions for a given category."""
    cat_lower = category_name.lower()
    rule_list = None
    for key, rules in _CATEGORY_MAP.items():
        if key in cat_lower:
            rule_list = rules
            break
    if not rule_list:
        return []

    combined_text = " ".join(suggestions).lower()
    seen_actions: set[str] = set()
    matched: list[dict] = []
    for rule in rule_list:
        if any(t in combined_text for t in rule["trigger"]):
            if rule["action"] not in seen_actions:
                seen_actions.add(rule["action"])
                matched.append({
                    "category": category_name,
                    "priority": _PRIORITY_MAP.get(cat_lower.split(" &")[0].split(" /")[0].strip(), "medium"),
                    "action": rule["action"],
                    "example": rule.get("example", ""),
                    "score_impact": rule.get("score_impact", 3),
                })
    return matched


def build_user_actions(
    eval_results: list[dict],
    pass_threshold: int,
    final_score: int,
) -> dict:
    """Build the user_actions_needed payload for the generate response.

    Returns:
        {
          "threshold_not_met": True,
          "current_score": int,
          "target_score": int,
          "points_needed": int,
          "message": str,
          "actions": [{"category", "priority", "action", "example", "score_impact"}, ...]
        }

    Pure function — no I/O, fully unit-testable.
    """
    category_suggestions: dict[str, list[str]] = {}

    for result in eval_results:
        for suggestion in result.get("suggestions") or []:
            # Suggestions are prefixed "[CategoryName] text"
            if suggestion.startswith("[") and "]" in suggestion:
                cat = suggestion[1: suggestion.index("]")] 
                text = suggestion[suggestion.index("]") + 2:]
                category_suggestions.setdefault(cat, []).append(text)

    actions: list[dict] = []
    for cat, suggestions in category_suggestions.items():
        actions.extend(_match_actions(cat, suggestions))

    # Sort: critical first, then by score_impact descending
    priority_order = {"critical": 0, "high": 1, "medium": 2}
    actions.sort(key=lambda a: (priority_order.get(a["priority"], 9), -a["score_impact"]))

    # Deduplicate by action text
    seen: set[str] = set()
    unique_actions: list[dict] = []
    for a in actions:
        if a["action"] not in seen:
            seen.add(a["action"])
            unique_actions.append(a)

    points_needed = max(0, pass_threshold - final_score)
    total_potential = sum(a["score_impact"] for a in unique_actions)

    return {
        "threshold_not_met": True,
        "current_score": final_score,
        "target_score": pass_threshold,
        "points_needed": points_needed,
        "estimated_points_available": total_potential,
        "message": (
            f"Your CV scored {final_score}/100 — {points_needed} points below the {pass_threshold} threshold. "
            f"The actions below are things only you can add (real data the AI cannot fabricate). "
            f"Providing them could unlock an estimated +{total_potential} points."
        ),
        "actions": unique_actions,
    }
