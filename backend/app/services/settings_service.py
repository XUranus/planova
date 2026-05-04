import json
import time
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


async def test_llm_connection() -> dict:
    """
    Test LLM connection: basic API reachability, model availability,
    and multimodal capability check.
    Returns a result dict with status and details.
    """
    from openai import AsyncOpenAI
    from app.logging_config import get_logger

    logger = get_logger("services.settings")
    llm = get_llm_config()
    result = {
        "success": False,
        "api_reachable": False,
        "model_available": False,
        "multimodal_capable": False,
        "latency_ms": 0,
        "error": None,
        "details": {},
    }

    if not llm["api_key"]:
        result["error"] = "API key is empty"
        return result

    if not llm["base_url"]:
        result["error"] = "Base URL is empty"
        return result

    client = AsyncOpenAI(
        api_key=llm["api_key"],
        base_url=llm["base_url"],
    )

    # Test 1: Basic text completion (API reachable + model available)
    logger.info("LLM test: sending text request to %s model=%s", llm["base_url"], llm["model"])
    t0 = time.monotonic()
    try:
        resp = await client.chat.completions.create(
            model=llm["model"],
            messages=[{"role": "user", "content": "Reply with exactly: OK"}],
            max_tokens=10,
            temperature=0.0,
        )
        latency = (time.monotonic() - t0) * 1000
        result["api_reachable"] = True
        result["model_available"] = True
        result["latency_ms"] = round(latency, 1)

        content = resp.choices[0].message.content or ""
        if not content and hasattr(resp.choices[0].message, "model_extra"):
            content = resp.choices[0].message.model_extra.get("reasoning_content", "") or ""
        result["details"]["text_response"] = content[:100]
        result["details"]["text_tokens"] = resp.usage.total_tokens if resp.usage else 0

        logger.info("LLM test: text OK, %.0fms, %d tokens", latency, result["details"]["text_tokens"])

    except Exception as e:
        result["error"] = f"Text request failed: {e}"
        logger.error("LLM test: text request failed: %s", e)
        return result

    # Test 2: Multimodal capability (image input)
    # Use a tiny 1x1 red pixel PNG as test image
    import base64
    tiny_png = base64.b64encode(
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    ).decode()

    logger.info("LLM test: sending multimodal request...")
    try:
        resp2 = await client.chat.completions.create(
            model=llm["model"],
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "What color is this pixel? Reply with one word."},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{tiny_png}"}},
                ],
            }],
            max_tokens=20,
            temperature=0.0,
        )
        mm_content = resp2.choices[0].message.content or ""
        if not mm_content and hasattr(resp2.choices[0].message, "model_extra"):
            mm_content = resp2.choices[0].message.model_extra.get("reasoning_content", "") or ""

        if mm_content:
            result["multimodal_capable"] = True
            result["details"]["multimodal_response"] = mm_content[:100]
            logger.info("LLM test: multimodal OK, response: %s", mm_content[:50])
        else:
            result["details"]["multimodal_response"] = "(empty response)"
            logger.warning("LLM test: multimodal returned empty content")

    except Exception as e:
        result["details"]["multimodal_error"] = str(e)
        logger.warning("LLM test: multimodal request failed: %s", e)

    result["success"] = result["api_reachable"] and result["model_available"]
    return result
