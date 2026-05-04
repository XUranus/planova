from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scene import Scene


async def save_scene(db: AsyncSession, project_id: str, scene_json: dict) -> Scene:
    """Create or update a scene for a project."""
    # Check if scene exists for this project
    result = await db.execute(select(Scene).where(Scene.project_id == project_id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.scene_json = scene_json
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    scene = Scene(project_id=project_id, schema_version="0.1.0", scene_json=scene_json)
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene


async def get_scene(db: AsyncSession, project_id: str) -> Scene | None:
    result = await db.execute(select(Scene).where(Scene.project_id == project_id))
    return result.scalar_one_or_none()


async def update_scene(db: AsyncSession, project_id: str, scene_json: dict) -> Scene | None:
    result = await db.execute(select(Scene).where(Scene.project_id == project_id))
    scene = result.scalar_one_or_none()
    if not scene:
        return None
    scene.scene_json = scene_json
    scene.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(scene)
    return scene
