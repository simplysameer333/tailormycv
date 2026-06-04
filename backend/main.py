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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    from database import get_db
    from services.profession_service import seed_professions
    await seed_professions(get_db())
    await tier_config_service.load_config(get_db())
    from services.cv_template_service import seed_cv_templates
    await seed_cv_templates(get_db())
    start_scheduler()
    yield
    stop_scheduler()
    await disconnect_db()


app = FastAPI(title="TailorMyCv API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """Return human-readable validation errors instead of raw Pydantic detail."""
    errors = []
    for err in exc.errors():
        field = " → ".join(str(loc) for loc in err["loc"] if loc != "body")
        errors.append(f"{field}: {err['msg']}" if field else err["msg"])
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(errors) or "Invalid request body"},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    """Ensure all HTTP errors return consistent JSON."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": str(exc.detail)},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    """Catch-all for unexpected server errors — log, email alert, return generic 500."""
    tb = traceback.format_exc()
    logger.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        tb,
    )
    # Fire-and-forget alert email — never blocks the error response
    import asyncio
    from services.email_service import send_error_alert
    asyncio.create_task(send_error_alert(request.method, request.url.path, exc, tb))

    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred. Please try again or contact support."},
    )


# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(auth.router, prefix="/api")
app.include_router(resume.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(job_description.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(professions.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(resume_library.router, prefix="/api")
app.include_router(job_alerts.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(linkedin.router, prefix="/api")
app.include_router(config_router.router, prefix="/api")
app.include_router(cv_templates.router, prefix="/api")
app.include_router(admin_cv_templates.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "app": "TailorMyCv"}
