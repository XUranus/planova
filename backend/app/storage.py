import shutil
import uuid
from pathlib import Path

from app.config import settings


def ensure_dirs():
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.preview_dir.mkdir(parents=True, exist_ok=True)


def save_upload(file_bytes: bytes, original_filename: str) -> str:
    """Save uploaded file to disk. Returns the storage path."""
    ensure_dirs()
    ext = Path(original_filename).suffix.lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    path = settings.upload_dir / filename
    path.write_bytes(file_bytes)
    return str(path)


def delete_file(storage_path: str) -> None:
    """Delete a file from disk if it exists."""
    try:
        Path(storage_path).unlink(missing_ok=True)
    except Exception:
        pass


def get_preview_path(storage_path: str) -> str | None:
    """Generate a preview path for an uploaded file."""
    ensure_dirs()
    src = Path(storage_path)
    if not src.exists():
        return None
    preview_name = f"{src.stem}_preview{src.suffix}"
    preview_path = settings.preview_dir / preview_name
    return str(preview_path)
