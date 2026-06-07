import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from contextlib import asynccontextmanager

from config import settings
from database import connect_db, disconnect_db
from routers import (
    resume, profile, job_description, generate, export,
    professions, auth, jobs, account, catalog, resume_library, job_alerts, admin, linkedin,
    config as config_router, cv_templates, admin_cv_templates,
)
from services.alert_scheduler import start_scheduler, stop_scheduler
from services import tier_config_service

logger = logging.getLogger("tailormycv")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def _configure_langsmith() -> None:
    """Set LangSmith env vars so LangGraph auto-traces all pipeline runs.

    LangChain/LangGraph picks up LANGCHAIN_TRACING_V2 and LANGSMITH_API_KEY
    automatically — no instrumentation code needed. This just ensures the vars
    are present before any LangGraph call is made. No-op when key is absent.
    """
    import os
    if not settings.langsmith_api_key:
        return
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    logger.info("[langsmith] Tracing enabled — project=%s", settings.langsmith_project)


_configure_langsmith()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()

    # Safety guard: DEV_BYPASS_AUTH disables ALL authentication. It must never be on
    # in a deployed environment. Detect Railway (or any non-local host) and shout.
    if settings.dev_bypass_auth:
        import os
        deployed = bool(
            os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID")
            or os.getenv("RAILWAY_SERVICE_ID") or os.getenv("RAILWAY_STATIC_URL")
        )
        if deployed:
            logger.error(
                "=" * 78 + "\n"
                "  SECURITY: DEV_BYPASS_AUTH=true on a DEPLOYED (Railway) environment.\n"
                "  ALL authentication is disabled. The frontend must also be in dev-bypass,\n"
                "  and any 'Bearer dev-*' token is accepted. Set DEV_BYPASS_AUTH=false in\n"
                "  production (and NEXT_PUBLIC_DEV_BYPASS_AUTH=false on the frontend).\n"
                + "=" * 78
            )
        else:
            logger.warning("DEV_BYPASS_AUTH=true (local dev) — authentication is bypassed.")

    from database import get_db
    from services.profession_service import seed_professions
    await seed_professions(get_db())
    await tier_config_service.load_config(get_db())
    from services.cv_template_service import seed_cv_templates
    await seed_cv_templates(get_db())
    from services.usage_service import ensure_indexes as ensure_usage_indexes
    await ensure_usage_indexes(get_db())
    from services.agent_memory import ensure_seed as ensure_agent_memory
    await ensure_agent_memory(get_db())
    start_scheduler()
    yield
    stop_scheduler()
    await disconnect_db()
