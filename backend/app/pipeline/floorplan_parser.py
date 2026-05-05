import json
import shutil
from pathlib import Path

from app.ai.openai_client import parse_floor_plan_with_vlm
from app.pipeline.preprocess import preprocess_floor_plan
from app.pipeline.normalizer import normalize_scene
from app.logging_config import get_logger
from app.config import settings

logger = get_logger("pipeline.floorplan")


def _save_pipeline_artifacts(project_id: str, image_path: str, processed_path: str,
                             raw_vlm: dict, scene_json: dict) -> dict:
    """Save all intermediate pipeline outputs for debugging and observability."""
    pipeline_dir = settings.pipeline_dir / project_id
    pipeline_dir.mkdir(parents=True, exist_ok=True)

    artifacts = {}

    # 1. Copy preprocessed image
    src = Path(processed_path)
    ext = src.suffix or ".png"
    preprocessed_dest = pipeline_dir / f"preprocessed{ext}"
    try:
        shutil.copy2(processed_path, preprocessed_dest)
        artifacts["preprocessed_image"] = str(preprocessed_dest)
        logger.info("Saved preprocessed image -> %s", preprocessed_dest)
    except OSError as e:
        logger.warning("Could not copy preprocessed image: %s", e)

    # 2. Save raw VLM response
    vlm_path = pipeline_dir / "vlm_response.json"
    try:
        with open(vlm_path, "w", encoding="utf-8") as f:
            json.dump(raw_vlm, f, indent=2, ensure_ascii=False)
        artifacts["vlm_response"] = str(vlm_path)
        logger.info("Saved VLM response -> %s", vlm_path)
    except OSError as e:
        logger.warning("Could not save VLM response: %s", e)

    # 3. Save normalized scene
    scene_path = pipeline_dir / "scene_normalized.json"
    try:
        with open(scene_path, "w", encoding="utf-8") as f:
            json.dump(scene_json, f, indent=2, ensure_ascii=False)
        artifacts["scene_normalized"] = str(scene_path)
        logger.info("Saved normalized scene -> %s", scene_path)
    except OSError as e:
        logger.warning("Could not save normalized scene: %s", e)

    # 4. Save pipeline metadata
    meta = {
        "project_id": project_id,
        "source_image": str(image_path),
        "artifacts": artifacts,
        "vlm_stats": {
            "rooms": len(raw_vlm.get("detected_rooms", [])),
            "walls": len(raw_vlm.get("detected_walls", [])),
            "doors": len(raw_vlm.get("detected_doors", [])),
            "windows": len(raw_vlm.get("detected_windows", [])),
            "scale_info": raw_vlm.get("scale_info", {}),
            "overall_dimensions": raw_vlm.get("overall_dimensions", {}),
            "warnings": raw_vlm.get("warnings", []),
        },
        "scene_stats": {
            "rooms": len(scene_json.get("rooms", [])),
            "walls": len(scene_json.get("walls", [])),
            "openings": len(scene_json.get("openings", [])),
            "materials": len(scene_json.get("materials", [])),
            "lights": len(scene_json.get("lights", [])),
            "cameras": len(scene_json.get("cameras", [])),
        },
    }
    meta_path = pipeline_dir / "meta.json"
    try:
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
        artifacts["meta"] = str(meta_path)
    except OSError:
        pass

    logger.info("Pipeline artifacts saved to %s", pipeline_dir)
    return artifacts


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
    Saves all intermediate artifacts for observability.
    """
    # Step 1: Preprocess image
    logger.info("Step 1/3: Preprocessing image %s", image_path)
    processed_path = preprocess_floor_plan(image_path)
    logger.info("Preprocessed -> %s (size: %d bytes)", processed_path, Path(processed_path).stat().st_size)

    # Step 2: Call VLM to parse floor plan
    logger.info("Step 2/3: Calling VLM to parse floor plan...")
    raw_result = await parse_floor_plan_with_vlm(processed_path)
    logger.info("VLM returned: %d rooms, %d walls, %d doors, %d windows",
                len(raw_result.get("detected_rooms", [])),
                len(raw_result.get("detected_walls", [])),
                len(raw_result.get("detected_doors", [])),
                len(raw_result.get("detected_windows", [])))
    if raw_result.get("warnings"):
        for w in raw_result["warnings"]:
            logger.warning("VLM warning: %s", w)

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

    # Save all intermediate artifacts
    _save_pipeline_artifacts(project_id, image_path, processed_path, raw_result, scene_json)

    return scene_json
