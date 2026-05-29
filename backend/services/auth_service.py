"""Auth utilities: JWT, password hashing, user CRUD."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from jose import jwt
from passlib.context import CryptContext

from config import settings
from database import get_db

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_ACCESS_TTL_H = 24


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def create_access_token(user_id: str, email: str, tier: str, is_superadmin: bool = False) -> str:
    exp = datetime.utcnow() + timedelta(hours=_ACCESS_TTL_H)
    return jwt.encode(
        {"sub": user_id, "email": email, "tier": tier, "is_superadmin": is_superadmin, "exp": exp},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict:
    """Raises jose.JWTError if invalid or expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def get_user_by_email(email: str) -> Optional[dict]:
    db = get_db()
    return await db.users.find_one({"email": email.lower()})


async def get_user_by_id(user_id: str) -> Optional[dict]:
    db = get_db()
    try:
        return await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        return None


async def create_user(
    email: str,
    name: str,
    hashed_password: Optional[str] = None,
    google_id: Optional[str] = None,
    tier: str = "free",
) -> dict:
    db = get_db()
    now = datetime.utcnow()
    doc = {
        "email": email.lower(),
        "name": name,
        "hashed_password": hashed_password,
        "google_id": google_id,
        "tier": tier,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "tier": user.get("tier", "free"),
        "has_password": bool(user.get("hashed_password")),
        "is_superadmin": bool(user.get("is_superadmin", False)),
    }
