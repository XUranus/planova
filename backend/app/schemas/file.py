from datetime import datetime

from pydantic import BaseModel


class FileResponse(BaseModel):
    id: str
    project_id: str
    original_filename: str
    file_type: str
    file_size: int
    preview_url: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}
