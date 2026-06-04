from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pymongo import IndexModel, ASCENDING
from config import settings

client: AsyncIOMotorClient = None
db = None
fs: AsyncIOMotorGridFSBucket = None


async def connect_db():
    global client, db, fs
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client.tailormycv
    fs = AsyncIOMotorGridFSBucket(db)
    await _ensure_indexes()


async def disconnect_db():
    if client:
        client.close()


async def _ensure_indexes():
    # TTL index: auto-delete session docs after 24 hours of inactivity
    await db.sessions.create_index(
        "created_at", expireAfterSeconds=86400
    )
    # TTL index on GridFS files metadata
    await db["fs.files"].create_index(
        "uploadDate", expireAfterSeconds=86400
    )
    # Users — unique email + google_id lookups
    await db.users.create_index("email", unique=True)
    await db.users.create_index("google_id", sparse=True)
    # Saved jobs — compound index for fast per-user lookup + duplicate check
    await db.saved_jobs.create_index([("user_id", 1), ("job_id", 1)], unique=True)
    # User profiles — one profile per user
    await db.user_profiles.create_index("user_id", unique=True)
    # Catalog — roles and skills autocomplete
    await db.catalog.create_index([("type", 1), ("name", 1)])
    # Job search cache — TTL 1 hour
    await db.search_cache.create_index("cached_at", expireAfterSeconds=3600)
    await db.search_cache.create_index("key", unique=True)
    # API quota tracking
    await db.api_quota.create_index([("provider", 1), ("month", 1)], unique=True)
    # Resume library
    await db.saved_resumes.create_index([("user_id", 1), ("created_at", -1)])
    # Job alerts — per-user list + scheduler's active-alert scan
    await db.job_alerts.create_index([("user_id", 1), ("created_at", -1)])
    await db.job_alerts.create_index("is_active")
    # Admin — audit log (recent-first per user) and prompt overrides (unique key)
    await db.audit_log.create_index([("created_at", -1)])
    await db.audit_log.create_index([("user_id", 1), ("created_at", -1)])
    await db.prompt_overrides.create_index("key", unique=True)
    # CV templates (HTML preview templates) — unique key + ordered listing
    await db.cv_templates.create_index("key", unique=True)
    await db.cv_templates.create_index("sort_order")
    # LLM output caches ─────────────────────────────────────────────────────
    # CV Score: index on text_hash for fast lookup; no TTL (results are permalinks)
    await db.cv_check_results.create_index("text_hash", sparse=True)
    await db.cv_check_results.create_index([("text_hash", 1), ("created_at", -1)])
    # Generation cache: unique index on input_hash prevents duplicate entries;
    # TTL index auto-deletes entries older than 30 days to keep the collection lean
    await db.generation_cache.create_index("input_hash", unique=True)
    await db.generation_cache.create_index(
        "created_at", expireAfterSeconds=30 * 86400  # 30 days
    )


def get_db():
    return db


def get_fs():
    return fs
