pub mod furniture;
pub mod normalizer;
pub mod preprocess;

use std::path::Path;

pub async fn run_pipeline(
    image_path: &str,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_id: &str,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    // Step 1: Preprocess image
    log::info!("Step 1/4: Preprocessing image {image_path}");
    let processed_path = preprocess::preprocess_floor_plan(image_path)?;
    log::info!("Preprocessed -> {processed_path}");

    // Step 2: VLM parse
    log::info!("Step 2/4: Calling VLM to parse floor plan...");
    let config = crate::settings::get_llm_config(data_dir);
    if config.api_key.is_empty() {
        return Err("LLM API key not configured".to_string());
    }
    let raw_result = crate::ai::client::call_vlm(&processed_path, &config, data_dir).await?;
    log::info!(
        "VLM returned: {} rooms, {} walls, {} doors, {} windows",
        raw_result.get("detected_rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        raw_result.get("detected_walls").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        raw_result.get("detected_doors").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        raw_result.get("detected_windows").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    );

    // Step 3: Normalize
    log::info!("Step 3/4: Normalizing scene (style={style})...");
    let mut scene_json = normalizer::normalize_scene(
        &raw_result,
        style,
        ceiling_height,
        wall_thickness,
        "Untitled", // project name - could be fetched from DB
        project_id,
    );

    // Patch rooms with material refs
    let style_owned = style.to_string();
    if let Some(rooms) = scene_json.get_mut("rooms").and_then(|v| v.as_array_mut()) {
        for room in rooms.iter_mut() {
            let room_type = room
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("living_room");
            room["floor_material"] =
                serde_json::Value::String(format!("mat_{style_owned}_floor_{room_type}"));
            room["wall_material"] =
                serde_json::Value::String(format!("mat_{style_owned}_wall"));
            room["ceiling_material"] =
                serde_json::Value::String(format!("mat_{style_owned}_ceiling"));
        }
    }

    log::info!(
        "Normalized: {} rooms, {} walls",
        scene_json.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        scene_json.get("walls").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    );

    // Step 4: Furniture planning
    log::info!("Step 4/4: Planning furniture layout with LLM...");
    scene_json = furniture::plan_furniture(&scene_json, data_dir).await?;
    log::info!(
        "Furniture planning: {} objects placed",
        scene_json.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    );

    // Save pipeline artifacts
    save_pipeline_artifacts(project_id, image_path, &processed_path, &raw_result, &scene_json, data_dir)?;

    Ok(scene_json)
}

fn save_pipeline_artifacts(
    project_id: &str,
    _image_path: &str,
    processed_path: &str,
    raw_vlm: &serde_json::Value,
    scene_json: &serde_json::Value,
    data_dir: &Path,
) -> Result<(), String> {
    let pipeline_dir = data_dir.join("pipeline").join(project_id);
    std::fs::create_dir_all(&pipeline_dir).map_err(|e| e.to_string())?;

    // Copy preprocessed image
    let src = Path::new(processed_path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let preprocessed_dest = pipeline_dir.join(format!("preprocessed.{ext}"));
    if let Err(e) = std::fs::copy(processed_path, &preprocessed_dest) {
        log::warn!("Could not copy preprocessed image: {e}");
    }

    // Save VLM response
    let vlm_path = pipeline_dir.join("vlm_response.json");
    if let Ok(json) = serde_json::to_string_pretty(raw_vlm) {
        let _ = std::fs::write(&vlm_path, json);
    }

    // Save normalized scene
    let scene_path = pipeline_dir.join("scene_normalized.json");
    if let Ok(json) = serde_json::to_string_pretty(scene_json) {
        let _ = std::fs::write(&scene_path, json);
    }

    // Save meta
    let meta = serde_json::json!({
        "project_id": project_id,
        "vlm_stats": {
            "rooms": raw_vlm.get("detected_rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "walls": raw_vlm.get("detected_walls").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "doors": raw_vlm.get("detected_doors").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "windows": raw_vlm.get("detected_windows").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        },
        "scene_stats": {
            "rooms": scene_json.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "walls": scene_json.get("walls").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "objects": scene_json.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "materials": scene_json.get("materials").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        },
    });
    let meta_path = pipeline_dir.join("meta.json");
    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(&meta_path, json);
    }

    log::info!("Pipeline artifacts saved to {}", pipeline_dir.display());
    Ok(())
}
