"""Tier config endpoints.

GET  /api/config/tiers         — public; returns live feature gates + limits
PUT  /api/admin/config/tiers   — superadmin; updates MongoDB + reloads cache
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dependencies.auth import require_superadmin
from services import tier_config_service

router = APIRouter()


class TierConfigBody(BaseModel):
    features: dict[str, list[str]]
    limits: dict[str, dict[str, int | None]]


@router.get("/config/tiers")
async def get_tier_config():
    """Return the live tier config. No auth required — config is not sensitive."""
    return tier_config_service.get_config()


TIER_ORDER = ["free", "plus", "pro"]


def _validate_config(features: dict, limits: dict) -> list[str]:
    """Return a list of contradiction/consistency errors. Empty = valid."""
    errors: list[str] = []
    valid_tiers = set(TIER_ORDER)

    # ── Feature validation ─────────────────────────────────────────────────────
    for feat, tiers in features.items():
        if not isinstance(tiers, list):
            errors.append(f"Feature '{feat}': must be a list.")
            continue
        invalid = set(tiers) - valid_tiers
        if invalid:
            errors.append(f"Feature '{feat}': unknown tier(s) {sorted(invalid)}.")
            continue
        # Monotonicity: if a lower tier has the feature, all higher tiers must too.
        # e.g. "free" has it → "plus" and "pro" must also have it.
        tier_set = set(tiers)
        for i, tier in enumerate(TIER_ORDER):
            if tier in tier_set:
                for higher in TIER_ORDER[i + 1:]:
                    if higher not in tier_set:
                        errors.append(
                            f"Feature '{feat}': '{tier}' has access but '{higher}' does not — "
                            f"higher tiers must always include features available on lower tiers."
                        )

    # ── Limit validation ───────────────────────────────────────────────────────
    for limit_key, tier_limits in limits.items():
        prev_val: int | None = None
        prev_tier: str = ""
        for tier in TIER_ORDER:
            if tier not in tier_limits:
                continue
            val = tier_limits[tier]
            if val is not None and not isinstance(val, int):
                errors.append(f"Limit '{limit_key}' tier '{tier}': must be an integer or null (unlimited).")
                continue
            # null = unlimited — must be >= any finite value before it
            if prev_val is not None and val is not None and val < prev_val:
                errors.append(
                    f"Limit '{limit_key}': '{tier}' value ({val}) is less than "
                    f"'{prev_tier}' value ({prev_val}) — limits must be non-decreasing across tiers."
                )
            if val is not None:
                prev_val = val
                prev_tier = tier
            # Once we see null (unlimited) we stop comparing — null >= everything

    return errors


@router.put("/admin/config/tiers")
async def update_tier_config(
    body: TierConfigBody,
    _: dict = Depends(require_superadmin),
):
    """Persist new tier config to MongoDB and reload in-memory cache immediately.

    Validates for contradictions before saving:
    - Lower tiers cannot have features that higher tiers don't (monotonicity)
    - Numeric limits must be non-decreasing across tiers
    - null = unlimited (always valid as the top value)
    """
    errors = _validate_config(body.features, body.limits)
    if errors:
        raise HTTPException(422, {"message": "Tier config has contradictions", "errors": errors})

    await tier_config_service.save_config(body.features, body.limits)
    return {"ok": True, **tier_config_service.get_config()}
