"""Application settings loaded from .env via pydantic-settings.

All tunable behaviour — model names, cost controls, feature flags — lives here.
Change a value in .env; no code changes required.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── API keys ──────────────────────────────────────────────────────────────
    anthropic_api_key: str
    openai_api_key: str = ""
    google_api_key: str = ""

    # ── Model names — swap in .env without touching code ──────────────────────
    generator_model: str = "claude-sonnet-4-20250514"
    anthropic_evaluator_model: str = "claude-sonnet-4-20250514"
    openai_evaluator_model: str = "gpt-4o-mini"
    google_evaluator_model: str = "gemini-2.5-flash"

    # ── Evaluator feature flags ───────────────────────────────────────────────
    # Set to true/false in .env to enable/disable each evaluator independently.
    # Disabled evaluators are skipped entirely — no API call is made.
    anthropic_evaluator_enabled: bool = True
    openai_evaluator_enabled: bool = False    # off by default to reduce cost
    google_evaluator_enabled: bool = False    # off by default to reduce cost

    # ── Pipeline quality thresholds ───────────────────────────────────────────
    # Minimum score (0–100) all evaluators must reach before the resume is accepted.
    # Lower values = fewer refinement loops = lower cost. Start at 50 for launch.
    pass_threshold: int = 50
    # Maximum generator-evaluator cycles per session before returning best result.
    max_eval_cycles: int = 3

    # ── Per-session cost controls ─────────────────────────────────────────────
    # Hard cap on total AI API calls per session across all generate invocations.
    # 1 pipeline run with 1 evaluator = 2 calls/cycle (generator + evaluator).
    # Set to 0 to disable the cap.
    max_ai_calls_per_session: int = 10

    # ── Skill extraction (JobAnalyzerAgent) ──────────────────────────────────
    # Number of key skills the job analyzer picks and passes to the generator.
    # Maps to subscription tiers — override per-user when billing is wired:
    #   Free  = 3  |  Plus = 5  |  Pro = 10
    skill_extraction_count: int = 3

    # ── Feature flags ─────────────────────────────────────────────────────────
    # PDF export runs LibreOffice headless — disable on environments without it.
    pdf_export_enabled: bool = False
    # Slug of the first/featured profession used as fallback when no keyword matches.
    featured_profession_slug: str = "software_engineer"

    # ── File storage ─────────────────────────────────────────────────────────
    # Switch backends by changing STORAGE_BACKEND — no code changes needed.
    #   "local"  →  files saved under STORAGE_LOCAL_PATH (default; dev-friendly)
    #   "s3"     →  files uploaded to AWS S3 (set AWS_S3_BUCKET + credentials)
    storage_backend: str = "local"
    storage_local_path: str = "./uploads"
    # S3 backend settings (ignored when storage_backend=local)
    aws_s3_bucket: str = ""
    aws_s3_prefix: str = "uploads/"
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # ── Auth ─────────────────────────────────────────────────────────────────
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    google_client_id: str = ""
    google_client_secret: str = ""
    # Set to true on localhost to accept dev-free / dev-plus / dev-pro tokens with no JWT check.
    dev_bypass_auth: bool = False

    # ── Job search ───────────────────────────────────────────────────────────
    rapidapi_key: str = ""
    # Monthly call budget for JSearch free tier (500). Set higher if on a paid plan.
    jsearch_monthly_limit: int = 500
    # Warn in API responses when usage crosses this percentage (and every 10% after).
    jsearch_quota_warn_pct: int = 50
    # How long to serve cached search results before hitting RapidAPI again (seconds).
    # Same query+location+page within this window costs zero quota.
    jsearch_cache_ttl_s: int = 7200  # 2 hours default

    # ── Infrastructure ────────────────────────────────────────────────────────
    mongodb_uri: str
    allowed_origins: str = "http://localhost:4000"
    frontend_url: str = "http://localhost:4000"

    # ── Email (Brevo HTTP API for job alert digests) ─────────────────────────
    # Sign up free at brevo.com — verify tailormycv.alerts@gmail.com as sender,
    # then grab the API key from Settings → SMTP & API → API Keys.
    support_email: str = "tailormycv.alerts@gmail.com"
    brevo_api_key: str = ""
    brevo_sender_email: str = "tailormycv.alerts@gmail.com"

    # ── Alerts ────────────────────────────────────────────────────────────────
    # UTC hour (0–23) at which the daily alert job runs
    alert_send_hour: int = 8
    # Max jobs included per alert digest email
    alert_max_jobs_per_email: int = 10

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
