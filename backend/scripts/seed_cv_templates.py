"""Seed the `cv_templates` collection with the 20 built-in templates.

Idempotent — only inserts templates whose key is missing (preserves admin edits).
The backend also runs this automatically at startup; use this for a manual run.

Usage (from backend/):  python -m scripts.seed_cv_templates
"""
import asyncio
import sys
from pathlib import Path

# Allow running as a plain script: `python scripts/seed_cv_templates.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from config import settings
from services.cv_template_service import seed_cv_templates


async def main():
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.tailormycv
    await db.cv_templates.create_index("key", unique=True)
    inserted = await seed_cv_templates(db)
    total = await db.cv_templates.count_documents({})
    in_score = await db.cv_templates.count_documents({"show_in_cv_score": True})
    print(f"Inserted {inserted} new template(s). Collection now has {total} "
          f"({in_score} flagged show_in_cv_score).")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
