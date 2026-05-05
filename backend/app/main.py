from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.logging_config import setup_logging, get_logger
from app.api import projects, files, tasks, scenes, settings as settings_api

logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    setup_logging()
    logger.info("Planova backend starting on %s:%d", settings.host, settings.port)
    logger.info("Data directory: %s", settings.data_dir)

    # Create all runtime directories
    for d in [settings.data_dir, settings.upload_dir, settings.preview_dir,
              settings.log_dir, settings.audit_dir, settings.pipeline_dir]:
        d.mkdir(parents=True, exist_ok=True)
        logger.debug("Ensured directory: %s", d)

    # Mount static files (must happen after dirs exist)
    app.mount("/previews", StaticFiles(directory=str(settings.preview_dir)), name="previews")
    app.mount("/uploads", StaticFiles(directory=str(settings.upload_dir)), name="uploads")
    app.mount("/pipeline", StaticFiles(directory=str(settings.pipeline_dir)), name="pipeline")

    await init_db()
    logger.info("Database initialized, all directories ready")
    yield
    logger.info("Planova backend shutting down")


app = FastAPI(
    title="Planova API",
    description="AI Floor Plan to 3D Interior - Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(projects.router, prefix="/api", tags=["projects"])
app.include_router(files.router, prefix="/api", tags=["files"])
app.include_router(tasks.router, prefix="/api", tags=["tasks"])
app.include_router(scenes.router, prefix="/api", tags=["scenes"])
app.include_router(settings_api.router, prefix="/api", tags=["settings"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
