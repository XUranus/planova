from datetime import datetime

from pydantic import BaseModel


class SceneResponse(BaseModel):
    id: str
    project_id: str
    schema_version: str
    scene_json: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SceneUpdate(BaseModel):
    scene_json: dict
