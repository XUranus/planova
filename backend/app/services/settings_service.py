import json
from pathlib import Path

from app.config import settings

SETTINGS_FILE = settings.data_dir / "settings.json"

DEFAULTS = {
    "llm_provider": {
        "base_url": "",
        "api_key": "",
        "model": "mimo-v2.5",
    },
}


def get_settings() -> dict:
    """Read settings from JSON file, return defaults if missing."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Merge with defaults for missing keys
            merged = {**DEFAULTS}
            for key in DEFAULTS:
                if key in data and isinstance(data[key], dict):
                    merged[key] = {**DEFAULTS[key], **data[key]}
                elif key in data:
                    merged[key] = data[key]
            return merged
        except (json.JSONDecodeError, OSError):
            pass
    return {**DEFAULTS}


def update_settings(data: dict) -> dict:
    """Merge data into settings and write to JSON file."""
    current = get_settings()
    for key in data:
        if isinstance(data[key], dict) and isinstance(current.get(key), dict):
            current[key] = {**current[key], **data[key]}
        else:
            current[key] = data[key]

    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)

    return current


def mask_api_key(key: str) -> str:
    """Mask API key for display: show last 4 chars."""
    if not key:
        return ""
    if len(key) <= 4:
        return "****"
    return "****" + key[-4:]


def get_llm_config() -> dict:
    """Get LLM provider config, falling back to env vars."""
    s = get_settings()
    provider = s.get("llm_provider", {})

    base_url = provider.get("base_url", "") or settings.openai_base_url
    api_key = provider.get("api_key", "") or settings.openai_api_key
    model = provider.get("model", "") or settings.openai_model

    return {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
    }
