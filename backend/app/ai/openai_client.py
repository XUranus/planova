import base64
import json
import re

from openai import AsyncOpenAI

from app.config import settings
from app.ai.prompts import FLOORPLAN_PARSE_SYSTEM, FLOORPLAN_PARSE_USER


async def parse_floor_plan_with_vlm(image_path: str) -> dict:
    """
    Call OpenAI Vision API to parse a floor plan image.
    Returns the raw parsed dict from the VLM response.
    """
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured. Set PLANOVA_OPENAI_API_KEY.")

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
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
    )

    response = await client.chat.completions.create(
        model=settings.openai_model,
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
