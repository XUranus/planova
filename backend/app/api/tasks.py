import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas.task import GenerateRequest, TaskResponse
from app.services import task_service
from app.logging_config import get_logger

logger = get_logger("api.tasks")
router = APIRouter()


@router.post("/projects/{project_id}/generate", response_model=TaskResponse)
async def start_generation(
    project_id: str,
    data: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    logger.info("Generate request: project=%s file=%s style=%s", project_id, data.file_id, data.style)
    options = {
        "ceiling_height": data.ceiling_height or 2.8,
        "wall_thickness": data.wall_thickness or 0.2,
    }
    task = await task_service.create_task(
        db,
        project_id=project_id,
        task_type="floorplan_parse",
        input_data={"file_id": data.file_id, "style": data.style, **options},
    )
    # Start background task
    task_service.start_generation_task(task.id, project_id, data.file_id, data.style, options)
    logger.info("Generation task created: %s", task.id)
    return task


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str, db: AsyncSession = Depends(get_db)):
    cancelled = await task_service.cancel_task(db, task_id)
    if not cancelled:
        raise HTTPException(400, "Task cannot be cancelled")
    return {"ok": True}


@router.get("/tasks/{task_id}/pipeline")
async def get_task_pipeline(task_id: str, db: AsyncSession = Depends(get_db)):
    """Get pipeline debug artifacts for a generation task."""
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    project_id = task.project_id
    pipeline_dir = settings.pipeline_dir / project_id
    meta_path = pipeline_dir / "meta.json"

    if not meta_path.exists():
        raise HTTPException(404, "Pipeline artifacts not found. The task may not have generated yet.")

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    # Add URLs for previewable artifacts
    meta["urls"] = {
        "preprocessed_image": f"/pipeline/{project_id}/preprocessed.png",
        "vlm_response": f"/pipeline/{project_id}/vlm_response.json",
        "scene_normalized": f"/pipeline/{project_id}/scene_normalized.json",
    }

    return meta
