"""Profession registry and resolution.

Convention
----------
Each profession has its own file in this package. The file exports a single
`CONFIG` dict with these keys:
  slug, display_name, keywords, generator_context, evaluator_context,
  scoring_criteria, aggregator_context, is_active

To add a new profession:
  1. Create professions/<slug>.py with a CONFIG dict.
  2. Import and add it to INITIAL_PROFESSIONS below.
  3. Run seed_professions.py to upsert it into MongoDB.

Runtime resolution reads from MongoDB (managed via /api/professions).
This file provides the seeding data and a local fallback resolver used
before the DB is available.
"""
from .generic import CONFIG as GENERIC_CONFIG
from .software_engineer import CONFIG as SOFTWARE_ENGINEER_CONFIG
from .animator import CONFIG as ANIMATOR_CONFIG
from .hotel_management import CONFIG as HOTEL_MANAGEMENT_CONFIG

# All professions to seed into MongoDB on startup (upsert — never overwrites edited fields).
# Generic must be last so specific professions take priority in keyword matching.
INITIAL_PROFESSIONS: list[dict] = [
    SOFTWARE_ENGINEER_CONFIG,
    ANIMATOR_CONFIG,
    HOTEL_MANAGEMENT_CONFIG,
    GENERIC_CONFIG,
]


def resolve_profession(professions: list[dict], target_role: str) -> dict:
    """Return the best-matching profession config for the given target_role.

    Iterates the profession list and returns the first whose keywords list
    contains a substring match against target_role (case-insensitive).
    Falls back to GENERIC_CONFIG when no profession matches.

    Args:
        professions: list of profession dicts, typically fetched from MongoDB.
        target_role: free-text role the candidate is targeting (from user profile).
    """
    role_lower = (target_role or "").lower()
    for profession in professions:
        if any(kw in role_lower for kw in profession.get("keywords", [])):
            return profession
    return GENERIC_CONFIG
