import base64
import json
import re

from openai import AsyncOpenAI

from app.ai.prompts import FLOORPLAN_PARSE_SYSTEM, FLOORPLAN_PARSE_USER
from app.services.settings_service import get_llm_config


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

    response = await client.chat.completions.create(
        model=llm["model"],
        messages=[
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
        ],
        max_tokens=4096,
        temperature=0.1,
    )

    content = response.choices[0].message.content or "{}"

    # Extract JSON from response (handle markdown code fences if present)
    return _extract_json(content)


def _extract_json(text: str) -> dict:
    """Extract a JSON object from text, handling markdown code fences."""
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

    # Try finding first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON from VLM response: {text[:200]}...")
