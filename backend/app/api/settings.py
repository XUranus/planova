from fastapi import APIRouter

from app.services.settings_service import get_settings, update_settings, mask_api_key

router = APIRouter()


def _mask_response(data: dict) -> dict:
    """Return settings with API key masked for safe display."""
    result = {**data}
    if "llm_provider" in result:
        result["llm_provider"] = {**result["llm_provider"]}
        result["llm_provider"]["api_key"] = mask_api_key(
            result["llm_provider"].get("api_key", "")
        )
    return result


@router.get("/settings")
async def read_settings():
    return _mask_response(get_settings())


@router.put("/settings")
async def write_settings(data: dict):
    updated = update_settings(data)
    return _mask_response(updated)
