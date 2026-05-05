import os
from pathlib import Path

from pydantic_settings import BaseSettings


def _default_data_dir() -> Path:
    """Determine default data directory matching Tauri's appDataDir."""
    # If PLANOVA_DATA_DIR is set, use it directly
    env_dir = os.environ.get("PLANOVA_DATA_DIR")
    if env_dir:
        return Path(env_dir)

    # Match Tauri's appDataDir: ~/.local/share/com.planova.app/ on Linux
    home = Path.home()
    xdg = os.environ.get("XDG_DATA_HOME")
    if xdg:
        base = Path(xdg)
    else:
        base = home / ".local" / "share"

    return base / "com.planova.app"


class Settings(BaseSettings):
    # Server
    host: str = "127.0.0.1"
    port: int = 8000

    # Database
    database_url: str = "sqlite+aiosqlite:///./planova.db"

    # AI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_base_url: str = "https://api.openai.com/v1"

    # Data root — all runtime data lives under this directory
    data_dir: Path = Path("")  # set in __init__ via _default_data_dir

    # Scene defaults
    default_ceiling_height: float = 2.8
    default_wall_thickness: float = 0.2

    # Upload limits
    max_upload_size: int = 50 * 1024 * 1024  # 50 MB

    model_config = {"env_prefix": "PLANOVA_", "env_file": ".env"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.data_dir or str(self.data_dir) == ".":
            self.data_dir = _default_data_dir()

    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def preview_dir(self) -> Path:
        return self.data_dir / "previews"

    @property
    def log_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def audit_dir(self) -> Path:
        return self.data_dir / "llm_audit"

    @property
    def pipeline_dir(self) -> Path:
        return self.data_dir / "pipeline"


settings = Settings()
