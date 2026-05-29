from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from database import connect_db, disconnect_db
from routers import resume, profile, job_description, templates, generate, export, professions, auth, jobs, account, catalog, resume_library, job_alerts, admin
from services.alert_scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    from database import get_db
    from services.profession_service import seed_professions
    await seed_professions(get_db())
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

app.include_router(auth.router, prefix="/api")
app.include_router(resume.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(job_description.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(generate.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(professions.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(resume_library.router, prefix="/api")
app.include_router(job_alerts.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "app": "TailorMyCv"}
