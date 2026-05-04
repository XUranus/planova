from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    style: str = "modern_luxury"


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    style: str | None = None
    status: str | None = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    style: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
