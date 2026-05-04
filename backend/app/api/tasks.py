from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

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
