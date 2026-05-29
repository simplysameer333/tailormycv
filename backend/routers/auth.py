"""Authentication router.

POST /api/auth/register  — email/password sign-up
POST /api/auth/login     — email/password sign-in → access token
POST /api/auth/sync      — called by NextAuth after Google OAuth → access token
GET  /api/auth/me        — returns current user (requires Bearer token)
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from dependencies.auth import get_current_user
from services.auth_service import (
    create_access_token,
    create_user,
    get_user_by_email,
    hash_password,
    serialize_user,
    verify_password,
)

router = APIRouter()


# ── Request bodies ────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    email: EmailStr
    name: str
    password: str
    tier: str = "free"


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class OAuthSyncBody(BaseModel):
    email: str
    name: str
    google_id: str
    provider: str = "google"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/auth/register", status_code=201)
async def register(body: RegisterBody):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    if await get_user_by_email(body.email):
        raise HTTPException(409, "An account with this email already exists.")
    tier = body.tier if body.tier in ("free", "plus", "pro") else "free"
    user = await create_user(
        body.email, body.name.strip(), hashed_password=hash_password(body.password), tier=tier
    )
    token = create_access_token(str(user["_id"]), user["email"], user["tier"], bool(user.get("is_superadmin")))
    return {"access_token": token, "user": serialize_user(user)}


@router.post("/auth/login")
async def login(body: LoginBody):
    user = await get_user_by_email(body.email)
    if not user or not user.get("hashed_password"):
        raise HTTPException(401, "Invalid email or password.")
    if not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(401, "Invalid email or password.")
    if not user.get("is_active", True):
        raise HTTPException(403, "Account is disabled.")
    token = create_access_token(str(user["_id"]), user["email"], user["tier"], bool(user.get("is_superadmin")))
    return {"access_token": token, "user": serialize_user(user)}


@router.post("/auth/sync")
async def sync_oauth_user(body: OAuthSyncBody):
    """Called by NextAuth after a successful Google OAuth flow.

    Finds an existing account by google_id or email, links the google_id to
    an existing email/password account if one exists, or creates a brand-new
    account. Returns our own JWT so the client only manages one token.
    """
    from database import get_db

    db = get_db()

    user = await db.users.find_one({"google_id": body.google_id})

    if not user:
        user = await db.users.find_one({"email": body.email.lower()})
        if user:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"google_id": body.google_id, "updated_at": datetime.utcnow()}},
            )
            user = await db.users.find_one({"_id": user["_id"]})

    if not user:
        user = await create_user(body.email, body.name, google_id=body.google_id)

    token = create_access_token(str(user["_id"]), user["email"], user["tier"], bool(user.get("is_superadmin")))
    return {"access_token": token, "user": serialize_user(user)}


@router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return serialize_user(user)
