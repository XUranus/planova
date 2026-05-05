import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import GenerationTask
from app.models.project import Project
from app.database import async_session
from app.logging_config import get_logger

logger = get_logger("services.task")


async def create_task(db: AsyncSession, project_id: str, task_type: str, input_data: dict) -> GenerationTask:
    task = GenerationTask(
        project_id=project_id,
        task_type=task_type,
        status="pending",
        progress=0,
        input_data=input_data,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    logger.info("Created task %s type=%s project=%s", task.id, task_type, project_id)
    return task


async def get_task(db: AsyncSession, task_id: str) -> GenerationTask | None:
    return await db.get(GenerationTask, task_id)


async def list_tasks(db: AsyncSession, project_id: str) -> list[GenerationTask]:
    result = await db.execute(
        select(GenerationTask)
        .where(GenerationTask.project_id == project_id)
        .order_by(GenerationTask.created_at.desc())
    )
    return list(result.scalars().all())


async def update_task_progress(db: AsyncSession, task_id: str, progress: int, status: str | None = None) -> None:
    task = await db.get(GenerationTask, task_id)
    if task:
        task.progress = progress
        if status:
            task.status = status
        task.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.debug("Task %s progress=%d status=%s", task_id, progress, status or task.status)


async def complete_task(db: AsyncSession, task_id: str, output_data: dict) -> None:
    task = await db.get(GenerationTask, task_id)
    if task:
        task.status = "completed"
        task.progress = 100
        task.output_data = output_data
        task.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Task %s completed: %s", task_id, output_data)


async def fail_task(db: AsyncSession, task_id: str, error_message: str) -> None:
    task = await db.get(GenerationTask, task_id)
    if task:
        task.status = "failed"
        task.error_message = error_message
        task.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.error("Task %s failed: %s", task_id, error_message)


async def cancel_task(db: AsyncSession, task_id: str) -> bool:
    task = await db.get(GenerationTask, task_id)
    if not task:
        return False
    if task.status in ("pending", "running"):
        task.status = "cancelled"
        task.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Task %s cancelled", task_id)
        return True
    return False


async def run_generation_task(task_id: str, project_id: str, file_id: str, style: str, options: dict) -> None:
    """
    Background task: preprocess floor plan → VLM parse → normalize → save scene.
    Runs in asyncio.create_task(), updates DB progress as it goes.
    """
    from app.services.file_service import get_file
    from app.services.scene_service import save_scene
    from app.pipeline.floorplan_parser import parse_floor_plan

    logger.info("Generation task %s started: project=%s file=%s style=%s", task_id, project_id, file_id, style)

    async with async_session() as db:
        try:
            # Update: running
            await update_task_progress(db, task_id, 0, "running")

            # Update project status
            project = await db.get(Project, project_id)
            if project:
                project.status = "generating"
                await db.commit()
                logger.info("Project %s status -> generating", project_id)

            # Get file
            uploaded = await get_file(db, file_id)
            if not uploaded:
                raise ValueError(f"File {file_id} not found")

            logger.info("File found: %s at %s", uploaded.original_filename, uploaded.storage_path)
            await update_task_progress(db, task_id, 10, "running")

            # Parse floor plan (preprocess + VLM + normalize)
            logger.info("Starting floor plan parsing pipeline...")
            scene_json = await parse_floor_plan(
                uploaded.storage_path,
                style=style,
                ceiling_height=options.get("ceiling_height", 2.8),
                wall_thickness=options.get("wall_thickness", 0.2),
                project_name=project.name if project else "Untitled",
                project_id=project_id,
            )

            logger.info(
                "Pipeline complete: %d rooms, %d walls, %d objects",
                len(scene_json.get("rooms", [])),
                len(scene_json.get("walls", [])),
                len(scene_json.get("objects", [])),
            )
            await update_task_progress(db, task_id, 80, "running")

            # Save scene
            scene = await save_scene(db, project_id, scene_json)
            logger.info("Scene saved: %s", scene.id)

            await update_task_progress(db, task_id, 95, "running")

            # Complete task
            await complete_task(db, task_id, {
                "scene_id": scene.id,
                "pipeline_urls": {
                    "preprocessed_image": f"/pipeline/{project_id}/preprocessed.png",
                    "vlm_response": f"/pipeline/{project_id}/vlm_response.json",
                    "scene_normalized": f"/pipeline/{project_id}/scene_normalized.json",
                    "meta": f"/api/tasks/{task_id}/pipeline",
                },
            })

            # Update project status
            if project:
                project.status = "completed"
                project.updated_at = datetime.now(timezone.utc)
                await db.commit()

            logger.info("Generation task %s finished successfully", task_id)

        except Exception as e:
            logger.exception("Generation task %s failed: %s", task_id, e)
            await fail_task(db, task_id, str(e))
            # Update project status
            async with async_session() as db2:
                project = await db2.get(Project, project_id)
                if project:
                    project.status = "error"
                    project.updated_at = datetime.now(timezone.utc)
                    await db2.commit()


def start_generation_task(task_id: str, project_id: str, file_id: str, style: str, options: dict) -> None:
    """Start a generation task in the background."""
    logger.info("Dispatching background generation task %s", task_id)
    asyncio.create_task(run_generation_task(task_id, project_id, file_id, style, options))
