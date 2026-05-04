from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import UploadedFile
from app.schemas.file import FileResponse
from app.storage import save_upload, delete_file, get_preview_path
from app.config import settings


async def save_uploaded_file(
    db: AsyncSession, project_id: str, filename: str, content_type: str, file_bytes: bytes
) -> UploadedFile:
    storage_path = save_upload(file_bytes, filename)
    preview_path = get_preview_path(storage_path)

    # Generate preview for images
    if content_type.startswith("image/"):
        _generate_image_preview(storage_path, preview_path)

    uploaded = UploadedFile(
        project_id=project_id,
        original_filename=filename,
        file_type=content_type,
        file_size=len(file_bytes),
        storage_path=storage_path,
        preview_path=preview_path or "",
    )
    db.add(uploaded)
    await db.commit()
    await db.refresh(uploaded)
    return uploaded


def _generate_image_preview(storage_path: str, preview_path: str | None) -> None:
    """Generate a thumbnail preview for an image file."""
    if not preview_path:
        return
    try:
        from PIL import Image

        img = Image.open(storage_path)
        img.thumbnail((512, 512))
        img.save(preview_path, quality=85)
    except Exception:
        pass


async def list_files(db: AsyncSession, project_id: str) -> list[UploadedFile]:
    result = await db.execute(
        select(UploadedFile).where(UploadedFile.project_id == project_id).order_by(UploadedFile.created_at)
    )
    return list(result.scalars().all())


async def get_file(db: AsyncSession, file_id: str) -> UploadedFile | None:
    return await db.get(UploadedFile, file_id)


async def delete_uploaded_file(db: AsyncSession, file_id: str) -> bool:
    uploaded = await db.get(UploadedFile, file_id)
    if not uploaded:
        return False
    delete_file(uploaded.storage_path)
    delete_file(uploaded.preview_path)
    await db.delete(uploaded)
    await db.commit()
    return True


def get_preview_url(file: UploadedFile) -> str:
    """Return the URL path to serve the preview."""
    if file.preview_path and Path(file.preview_path).exists():
        return f"/previews/{Path(file.preview_path).name}"
    return ""
