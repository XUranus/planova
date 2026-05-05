import base64
import json
import re
import time

from openai import AsyncOpenAI

from app.ai.prompts import FLOORPLAN_PARSE_SYSTEM, FLOORPLAN_PARSE_USER
from app.ai.audit import log_llm_call
from app.logging_config import get_logger
from app.services.settings_service import get_llm_config

logger = get_logger("ai.vlm")


def _extract_message_content(choice) -> str:
    """Extract text content from a chat completion choice, handling various model formats."""
    msg = choice.message

    # Standard content field
    content = (msg.content or "").strip()
    if content:
        return content

    # MIMO and similar models use reasoning_content in model_extra
    model_extra = getattr(msg, "model_extra", None) or {}
    reasoning = model_extra.get("reasoning_content", "")
    if reasoning:
        # reasoning_content may contain the full response for reasoning models
        return str(reasoning).strip()

    # Check if content is directly on the message object (non-standard)
    if hasattr(msg, "reasoning_content"):
        rc = getattr(msg, "reasoning_content")
        if rc:
            return str(rc).strip()

    return ""


async def parse_floor_plan_with_vlm(image_path: str) -> dict:
    """
    Call an OpenAI-compatible Vision API to parse a floor plan image.
    Reads LLM config at runtime from settings file (falls back to env vars).
    Returns the raw parsed dict from the VLM response.
    """
    llm = get_llm_config()

    if not llm["api_key"]:
        raise ValueError("LLM API key not configured. Set it in Settings or PLANOVA_OPENAI_API_KEY.")

    # Read and encode image
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    b64_image = base64.b64encode(image_bytes).decode("utf-8")
    logger.info("Encoded image %s (%d bytes -> %d base64 chars)", image_path, len(image_bytes), len(b64_image))

    # Determine media type
    suffix = image_path.lower().rsplit(".", 1)[-1]
    media_type = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
    }.get(suffix, "image/png")

    client = AsyncOpenAI(
        api_key=llm["api_key"],
        base_url=llm["base_url"],
    )

    messages = [
        {"role": "system", "content": FLOORPLAN_PARSE_SYSTEM},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": FLOORPLAN_PARSE_USER},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{b64_image}",
                        "detail": "high",
                    },
                },
            ],
        },
    ]

    logger.info("Calling VLM model=%s base_url=%s", llm["model"], llm["base_url"])

    t0 = time.monotonic()
    error_msg = None
    response_content = ""
    usage = None

    try:
        response = await client.chat.completions.create(
            model=llm["model"],
            messages=messages,
            max_tokens=16384,
            temperature=0.1,
        )

        choice = response.choices[0]
        finish_reason = getattr(choice, "finish_reason", "unknown")
        response_content = _extract_message_content(choice)

        usage = {
            "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) if response.usage else 0,
            "completion_tokens": getattr(response.usage, "completion_tokens", 0) if response.usage else 0,
            "total_tokens": getattr(response.usage, "total_tokens", 0) if response.usage else 0,
        }

        duration_ms = (time.monotonic() - t0) * 1000
        logger.info(
            "VLM response received: %d chars, finish_reason=%s, %d tokens, %.0fms",
            len(response_content),
            finish_reason,
            usage["total_tokens"],
            duration_ms,
        )

        if not response_content:
            logger.error(
                "VLM returned empty content! finish_reason=%s, tokens=%d",
                finish_reason,
                usage["completion_tokens"],
            )
            raise ValueError(
                f"VLM returned empty response (finish_reason={finish_reason}, "
                f"{usage['completion_tokens']} tokens consumed). "
                "Check llm_audit/ for full request details."
            )

    except Exception as e:
        duration_ms = (time.monotonic() - t0) * 1000
        error_msg = str(e)
        logger.error("VLM call failed after %.0fms: %s", duration_ms, error_msg)
        raise

    finally:
        # Audit log (even on failure)
        log_llm_call(
            model=llm["model"],
            messages=messages,
            response_content=response_content,
            usage=usage,
            duration_ms=duration_ms,
            error=error_msg,
        )

    # Extract JSON from response (handle markdown code fences if present)
    parsed = _extract_json(response_content)
    logger.info("Parsed JSON with %d keys: %s", len(parsed), list(parsed.keys()))
    return parsed


def _extract_json(text: str) -> dict:
    """Extract a JSON object from text, handling markdown code fences and reasoning prefixes."""
    # Try direct parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting from code fence
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding JSON block starting with {"detected_rooms" (our schema)
    schema_match = re.search(r'\{\s*"detected_rooms"', text)
    if schema_match:
        start = schema_match.start()
        end = text.rfind("}")
        if end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass

    # Try finding first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON from VLM response ({len(text)} chars): {text[:300]}...")
