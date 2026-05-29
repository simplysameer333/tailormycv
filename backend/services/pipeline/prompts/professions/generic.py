"""Fallback profession config — used when no specific profession matches the target role.

This config must work well across ALL industries and roles: finance, healthcare, law,
marketing, operations, sales, HR, consulting, and everything in between.
Every field is crafted to produce strong, universally applicable resume guidance.
"""

CONFIG = {
    "slug": "generic",
    "display_name": "General",
    "keywords": [],
    "generator_context": (
        "GENERAL RESUME WRITING GUIDANCE — All Professions:\n"
        "- Lead every bullet with the strongest available action verb that signals ownership "
        "and outcome. Prefer: Led, Delivered, Achieved, Grew, Reduced, Launched, Secured, "
        "Negotiated, Transformed, Resolved, Streamlined, Spearheaded, Implemented, Drove. "
        "Avoid weak openers: Helped, Assisted, Responsible for, Worked on, Involved in.\n"
        "- Quantify every achievement where data exists: monetary values (£/$M revenue, cost "
        "savings), percentages (efficiency gains, growth rates, error reduction), scale (team "
        "size, customer count, transaction volume), time (project duration, time-to-market "
        "savings), and rank (top 10%, #1 in region, award recipient).\n"
        "- Mirror the job description's language precisely. If the JD uses 'stakeholder "
        "management', 'P&L ownership', or 'cross-functional collaboration' — use those exact "
        "phrases where the candidate's experience supports it. ATS systems score keyword matches.\n"
        "- Write the professional summary as a direct answer to 'why hire this candidate for "
        "THIS specific role'. It must connect the candidate's strongest credentials to the "
        "employer's stated priorities. Avoid generic statements like 'results-driven professional'.\n"
        "- Order bullets within each role by relevance to the JD — the most JD-aligned "
        "achievement first, not necessarily the most recent. Cut or compress bullets with no "
        "relevance to this application.\n"
        "- Surface transferable signals of seniority and ownership: budget managed, team led, "
        "decisions made independently, projects delivered end-to-end, clients or stakeholders "
        "handled at what level."
    ),
    "evaluator_context": (
        "GENERAL EVALUATION GUIDANCE — All Professions:\n"
        "Evaluate the resume as a hiring manager for this specific role would. Probe for:\n"
        "- Does the resume directly address the core requirements of the job description, or "
        "does it read like a generic career summary with no JD-specific tailoring?\n"
        "- Are achievements quantified with real numbers, or do bullets merely describe "
        "responsibilities without outcomes? Flag every bullet that says what was done without "
        "saying what resulted from it.\n"
        "- Is the professional summary specific to this role and employer, or could it be "
        "copy-pasted onto any other application?\n"
        "- Do action verbs signal genuine ownership and impact, or are there passive/weak "
        "openers (Helped, Assisted, Responsible for, Participated in)?\n"
        "- Is the ordering of content strategic — most relevant experience and bullets "
        "appearing first — or is it purely chronological with no relevance weighting?\n"
        "- Are there critical JD keywords or requirements that appear nowhere in the resume, "
        "despite the candidate's background likely supporting them?"
    ),
    "scoring_criteria": (
        "Scoring criteria (0–100) for any professional role:\n"
        "- JD alignment and keyword match: core role requirements reflected in resume language, "
        "skills, and experience; critical JD terms present where candidate background supports (30 pts)\n"
        "- Achievement quantification: bullets include measurable outcomes — numbers, percentages, "
        "scale, monetary value, time savings; no bare responsibility statements (25 pts)\n"
        "- Action verb strength and bullet quality: strong ownership verbs, specific and concise "
        "bullets, no filler language or passive constructions (20 pts)\n"
        "- Professional summary relevance: summary directly positions candidate for this specific "
        "role, references the employer's priorities, avoids generic claims (15 pts)\n"
        "- Structure and strategic ordering: most relevant content surfaces first; skills section "
        "matches JD requirements; no irrelevant padding diluting the application (10 pts)"
    ),
    "aggregator_context": (
        "Focus improvement suggestions on:\n"
        "1. Unquantified bullets — identify every bullet that describes an action or responsibility "
        "without a measurable result, and suggest what metric would make it compelling "
        "(e.g., 'Managed a team' → 'Led a team of N, delivering X on time/under budget')\n"
        "2. JD keyword gaps — list critical requirements or phrases from the job description that "
        "do not appear in the resume despite the candidate's background likely supporting them\n"
        "3. Weak or passive verb openings — replace 'Helped', 'Assisted', 'Responsible for', "
        "'Worked on' with specific ownership verbs that reflect the candidate's actual contribution\n"
        "4. Generic summary — if the summary could apply to any candidate or any company, rewrite "
        "it to directly address why this candidate is the answer to this employer's specific need"
    ),
    "evaluator_names": [],
    "is_active": True,
}
