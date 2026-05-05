from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.file import UploadedFile
from app.models.task import GenerationTask
from app.models.scene import Scene
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.storage import delete_file


async def create_project(db: AsyncSession, data: ProjectCreate) -> Project:
    project = Project(name=data.name, description=data.description, style=data.style)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


async def list_projects(db: AsyncSession) -> list[Project]:
    result = await db.execute(select(Project).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


async def get_project(db: AsyncSession, project_id: str) -> Project | None:
    return await db.get(Project, project_id)


async def update_project(db: AsyncSession, project_id: str, data: ProjectUpdate) -> Project | None:
    project = await db.get(Project, project_id)
    if not project:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: str) -> bool:
    project = await db.get(Project, project_id)
    if not project:
        return False
    # Query files explicitly (avoid async lazy-load)
    result = await db.execute(select(UploadedFile).where(UploadedFile.project_id == project_id))
    for f in result.scalars().all():
        delete_file(f.storage_path)
        if f.preview_path:
            delete_file(f.preview_path)
    await db.delete(project)
    await db.commit()
    return True
