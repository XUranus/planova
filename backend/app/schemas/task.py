from datetime import datetime

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    file_id: str
    style: str = "modern_luxury"
    ceiling_height: float | None = None
    wall_thickness: float | None = None


class TaskResponse(BaseModel):
    id: str
    project_id: str
    task_type: str
    status: str
    progress: int
    input_data: dict | None = None
    output_data: dict | None = None
    error_message: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
