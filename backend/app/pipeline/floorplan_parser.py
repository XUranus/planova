from app.ai.openai_client import parse_floor_plan_with_vlm
from app.pipeline.preprocess import preprocess_floor_plan
from app.pipeline.normalizer import normalize_scene
from app.logging_config import get_logger

logger = get_logger("pipeline.floorplan")


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
    logger.info("Step 1/3: Preprocessing image %s", image_path)
    processed_path = preprocess_floor_plan(image_path)
    logger.info("Preprocessed -> %s", processed_path)

    # Step 2: Call VLM to parse floor plan
    logger.info("Step 2/3: Calling VLM to parse floor plan...")
    raw_result = await parse_floor_plan_with_vlm(processed_path)
    logger.info("VLM returned: %d rooms, %d walls, %d doors, %d windows",
                len(raw_result.get("detected_rooms", [])),
                len(raw_result.get("detected_walls", [])),
                len(raw_result.get("detected_doors", [])),
                len(raw_result.get("detected_windows", [])))

    # Step 3: Normalize to Home Scene JSON
    logger.info("Step 3/3: Normalizing scene (style=%s)...", style)
    scene_json = normalize_scene(
        raw=raw_result,
        style=style,
        ceiling_height=ceiling_height,
        wall_thickness=wall_thickness,
        project_name=project_name,
        project_id=project_id,
    )
    logger.info("Normalized scene: %d rooms, %d walls, %d materials",
                len(scene_json.get("rooms", [])),
                len(scene_json.get("walls", [])),
                len(scene_json.get("materials", [])))

    return scene_json
