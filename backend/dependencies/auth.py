"""FastAPI dependencies for authenticated and tier-gated routes."""
from __future__ import annotations

from datetime import datetime
from typing import Callable

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from config import settings
from services.auth_service import decode_access_token, get_user_by_id

_bearer = HTTPBearer(auto_error=False)

_TIER_ORDER = {"free": 0, "plus": 1, "pro": 2}
_DEV_TIERS = {"dev-free", "dev-plus", "dev-pro"}


async def _resolve_dev_user(tier: str) -> dict:
    """Find or create the dev seed user for the given tier."""
    from database import get_db
    db = get_db()
    email = f"dev-{tier}@tailormycv.dev"
    user = await db.users.find_one({"email": email})
    if not user:
        now = datetime.utcnow()
        result = await db.users.insert_one({
            "email": email,
            "name": f"Dev User ({tier.capitalize()})",
            "hashed_password": None,
            "google_id": None,
            "tier": tier,
            "is_active": True,
            "is_superadmin": True,
            "created_at": now,
            "updated_at": now,
        })
        user = await db.users.find_one({"_id": result.inserted_id})
    return user


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated.")

    token = creds.credentials

    # Dev bypass: accept dev-free / dev-plus / dev-pro without JWT verification.
    if settings.dev_bypass_auth and token in _DEV_TIERS:
        tier = token.split("-", 1)[1]
        return await _resolve_dev_user(tier)

    try:
        payload = decode_access_token(token)
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(401, "Invalid or expired token.")

    user = await get_user_by_id(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(401, "User not found.")
    return user


async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    # In dev bypass mode all local accounts are treated as superadmin
    if settings.dev_bypass_auth:
        return user
    if not user.get("is_superadmin"):
        raise HTTPException(403, "Admin access required.")
    return user


def require_tier(min_tier: str) -> Callable:
    """Factory — returns a dependency that enforces a minimum subscription tier."""
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if _TIER_ORDER.get(user.get("tier", "free"), 0) < _TIER_ORDER.get(min_tier, 0):
            raise HTTPException(
                403, f"This feature requires a {min_tier} subscription or above."
            )
        return user
    return _check
