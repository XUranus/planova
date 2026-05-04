from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./planova.db"

    # Storage
    upload_dir: Path = Path("./uploads")
    preview_dir: Path = Path("./previews")
    max_upload_size: int = 50 * 1024 * 1024  # 50 MB

    # AI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_base_url: str = "https://api.openai.com/v1"

    # Scene defaults
    default_ceiling_height: float = 2.8
    default_wall_thickness: float = 0.2

    model_config = {"env_prefix": "PLANOVA_", "env_file": ".env"}


settings = Settings()
