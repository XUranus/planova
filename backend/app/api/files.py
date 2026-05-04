from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse as FastAPIFileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.schemas.file import FileResponse
from app.services import file_service

router = APIRouter()


@router.post("/projects/{project_id}/files", response_model=FileResponse)
async def upload_file(
    project_id: str,
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db),
):
    # Validate file size
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_size:
        raise HTTPException(400, "File too large. Maximum size is 50MB.")

    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "application/pdf"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, "Invalid file type. Only JPG, PNG, PDF allowed.")

    uploaded = await file_service.save_uploaded_file(
        db, project_id, file.filename or "unknown", file.content_type, file_bytes
    )

    return FileResponse(
        id=uploaded.id,
        project_id=uploaded.project_id,
        original_filename=uploaded.original_filename,
        file_type=uploaded.file_type,
        file_size=uploaded.file_size,
        preview_url=file_service.get_preview_url(uploaded),
        created_at=uploaded.created_at,
    )


@router.get("/projects/{project_id}/files", response_model=list[FileResponse])
async def list_files(project_id: str, db: AsyncSession = Depends(get_db)):
    files = await file_service.list_files(db, project_id)
    return [
        FileResponse(
            id=f.id,
            project_id=f.project_id,
            original_filename=f.original_filename,
            file_type=f.file_type,
            file_size=f.file_size,
            preview_url=file_service.get_preview_url(f),
            created_at=f.created_at,
        )
        for f in files
    ]


@router.get("/files/{file_id}/preview")
async def get_file_preview(file_id: str, db: AsyncSession = Depends(get_db)):
    uploaded = await file_service.get_file(db, file_id)
    if not uploaded:
        raise HTTPException(404, "File not found")
    preview_path = uploaded.preview_path
    if not preview_path or not Path(preview_path).exists():
        # Fall back to original file
        preview_path = uploaded.storage_path
    if not Path(preview_path).exists():
        raise HTTPException(404, "Preview not found")
    return FastAPIFileResponse(preview_path)


@router.delete("/files/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await file_service.delete_uploaded_file(db, file_id)
    if not deleted:
        raise HTTPException(404, "File not found")
    return {"ok": True}
