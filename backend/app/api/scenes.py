from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.scene import SceneResponse, SceneUpdate
from app.services import scene_service

router = APIRouter()


@router.get("/projects/{project_id}/scene", response_model=SceneResponse)
async def get_scene(project_id: str, db: AsyncSession = Depends(get_db)):
    scene = await scene_service.get_scene(db, project_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return scene


@router.patch("/projects/{project_id}/scene", response_model=SceneResponse)
async def update_scene(project_id: str, data: SceneUpdate, db: AsyncSession = Depends(get_db)):
    scene = await scene_service.update_scene(db, project_id, data.scene_json)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return scene
