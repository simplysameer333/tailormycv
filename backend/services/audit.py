"""Fire-and-forget audit logging for write actions."""
from __future__ import annotations
import asyncio
from datetime import datetime
from database import get_db


async def _write(user_id: str, user_email: str, action: str, metadata: dict):
    try:
        db = get_db()
        await db.audit_log.insert_one({
            "user_id": user_id,
            "user_email": user_email,
            "action": action,
            "metadata": metadata,
            "created_at": datetime.utcnow(),
        })
    except Exception:
        pass  # audit must never break the main request


def log_audit(user: dict, action: str, metadata: dict | None = None):
    """Schedule an audit log write without blocking the caller."""
    asyncio.create_task(_write(
        str(user.get("_id", "")),
        user.get("email", ""),
        action,
        metadata or {},
    ))
