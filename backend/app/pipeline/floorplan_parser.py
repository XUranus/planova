from app.ai.openai_client import parse_floor_plan_with_vlm
from app.pipeline.preprocess import preprocess_floor_plan
from app.pipeline.normalizer import normalize_scene


async def parse_floor_plan(
    image_path: str,
    style: str,
    ceiling_height: float,
    wall_thickness: float,
    project_name: str,
    project_id: str,
) -> dict:
    """
    Full pipeline: preprocess image → VLM parse → normalize → Home Scene JSON.
    """
    # Step 1: Preprocess image
    processed_path = preprocess_floor_plan(image_path)

    # Step 2: Call VLM to parse floor plan
    raw_result = await parse_floor_plan_with_vlm(processed_path)

    # Step 3: Normalize to Home Scene JSON
    scene_json = normalize_scene(
        raw=raw_result,
        style=style,
        ceiling_height=ceiling_height,
        wall_thickness=wall_thickness,
        project_name=project_name,
        project_id=project_id,
    )

    return scene_json
