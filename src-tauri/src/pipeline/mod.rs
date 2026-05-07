pub mod furniture;
pub mod normalizer;
pub mod overlay;
pub mod preprocess;
pub mod repair;
pub mod validate;

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
    log::info!("Step 1/7: Preprocessing image {image_path}");
    let processed_path = preprocess::preprocess_floor_plan(image_path)?;
    log::info!("Preprocessed -> {processed_path}");

    // Step 2: VLM parse
    log::info!("Step 2/7: Calling VLM to parse floor plan...");
    let config = crate::settings::get_llm_config_for(data_dir, "vlm");
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
    log::info!("Step 3/7: Normalizing scene (style={style})...");
    let mut scene_json = normalizer::normalize_scene(
        &raw_result,
        style,
        ceiling_height,
        wall_thickness,
        "Untitled",
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

    // Step 4: Geometry repair
    log::info!("Step 4/7: Repairing geometry...");
    let repair_actions = repair::repair_scene(&mut scene_json);
    if !repair_actions.is_empty() {
        for action in &repair_actions {
            log::info!("  Repair: {action}");
        }
    }
    log::info!("Repair complete: {} action(s)", repair_actions.len());

    // Step 5: Validation
    log::info!("Step 5/7: Validating scene...");
    let validation_report = validate::validate_scene(&scene_json, &repair_actions);
    log::info!(
        "Validation: score={:.0}%, {} error(s), {} warning(s)",
        validation_report.score * 100.0,
        validation_report.errors.len(),
        validation_report.warnings.len(),
    );
    for err in &validation_report.errors {
        log::warn!("  Error: {}", err.message);
    }
    for warn in &validation_report.warnings {
        log::info!("  Warning: {}", warn.message);
    }

    // Inject parse_quality into scene JSON for frontend access
    scene_json["parse_quality"] = serde_json::json!({
        "overall_score": validation_report.score,
        "geometry_score": validation_report.parse_quality.geometry_score,
        "semantic_score": validation_report.parse_quality.semantic_score,
        "scale_score": validation_report.parse_quality.scale_score,
        "needs_user_review": validation_report.parse_quality.needs_user_review,
    });

    // Step 6: Generate debug overlay
    log::info!("Step 6/7: Generating debug overlay...");
    let pipeline_dir = data_dir.join("pipeline").join(project_id);
    if let Err(e) = overlay::generate_overlay(&processed_path, &raw_result, &pipeline_dir) {
        log::warn!("Failed to generate overlay: {e}");
    }

    // Step 7: Furniture planning
    log::info!("Step 7/7: Planning furniture layout with LLM...");
    scene_json = furniture::plan_furniture(&scene_json, data_dir).await?;
    log::info!(
        "Furniture planning: {} objects placed",
        scene_json.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    );

    // Save pipeline artifacts
    save_pipeline_artifacts(project_id, image_path, &processed_path, &raw_result, &scene_json, &validation_report, &repair_actions, data_dir)?;

    Ok(scene_json)
}

fn save_pipeline_artifacts(
    project_id: &str,
    _image_path: &str,
    processed_path: &str,
    raw_vlm: &serde_json::Value,
    scene_json: &serde_json::Value,
    validation_report: &validate::ValidationReport,
    repair_actions: &[String],
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

    // Save validation report
    let report_path = pipeline_dir.join("validation_report.json");
    if let Ok(json) = serde_json::to_string_pretty(validation_report) {
        let _ = std::fs::write(&report_path, json);
    }

    // Save repair log
    let repair_path = pipeline_dir.join("repair_log.json");
    if let Ok(json) = serde_json::to_string_pretty(repair_actions) {
        let _ = std::fs::write(&repair_path, json);
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
        "validation": {
            "score": validation_report.score,
            "error_count": validation_report.errors.len(),
            "warning_count": validation_report.warnings.len(),
            "repair_action_count": repair_actions.len(),
            "needs_user_review": validation_report.parse_quality.needs_user_review,
        },
    });
    let meta_path = pipeline_dir.join("meta.json");
    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(&meta_path, json);
    }

    log::info!("Pipeline artifacts saved to {}", pipeline_dir.display());
    Ok(())
}
