pub mod alignment;
pub mod convert;
pub mod furniture;
pub mod normalizer;
pub mod overlay;
pub mod overlay_alignment;
pub mod plan_graph;
pub mod preprocess;
pub mod repair;
pub mod validate;
pub mod wall_graph;
pub mod wall_mask;

#[cfg(test)]
mod test_e2e;

use std::path::Path;

pub async fn run_pipeline(
    image_path: &str,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_id: &str,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    let mode = crate::settings::get_pipeline_mode(data_dir);
    log::info!("Pipeline mode: {mode}");

    match mode.as_str() {
        "hybrid_cv_vlm" => {
            run_hybrid_pipeline(image_path, style, ceiling_height, wall_thickness, project_id, data_dir).await
        }
        _ => {
            run_legacy_pipeline(image_path, style, ceiling_height, wall_thickness, project_id, data_dir).await
        }
    }
}

/// Legacy pipeline: VLM does everything (geometry + semantics).
async fn run_legacy_pipeline(
    image_path: &str,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_id: &str,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    log::info!("=== Legacy Pipeline ===");

    // Step 1: Preprocess image
    log::info!("Step 1/7: Preprocessing image {image_path}");
    let processed_path = preprocess::preprocess_floor_plan(image_path)?;
    log::info!("Preprocessed -> {processed_path}");

    // Step 2: VLM parse (full geometry + semantics)
    log::info!("Step 2/7: Calling VLM to parse floor plan...");
    let config = crate::settings::get_llm_config_for(data_dir, "vlm");
    if config.api_key.is_empty() {
        return Err("LLM API key not configured. Please set up a vision-capable model in Settings.".to_string());
    }
    let raw_result = crate::ai::client::call_vlm(&processed_path, &config, data_dir).await
        .map_err(|e| format!("VLM call failed (model: {}, url: {}): {e}. Ensure your model supports image input.", config.model, config.base_url))?;
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
    patch_room_materials(&mut scene_json, style);

    // Step 4: Geometry repair
    log::info!("Step 4/7: Repairing geometry...");
    let repair_actions = repair::repair_scene(&mut scene_json);
    log::info!("Repair complete: {} action(s)", repair_actions.len());

    // Step 5: Validation (no alignment in legacy mode)
    log::info!("Step 5/7: Validating scene...");
    let validation_report = validate::validate_scene(&scene_json, &repair_actions);
    log_validation(&validation_report);

    // Inject parse_quality into scene JSON
    inject_parse_quality(&mut scene_json, &validation_report);

    // Step 6: Generate debug overlay
    log::info!("Step 6/7: Generating debug overlay...");
    let pipeline_dir = data_dir.join("pipeline").join(project_id);
    let _ = std::fs::create_dir_all(&pipeline_dir);
    if let Err(e) = overlay::generate_overlay(&processed_path, &raw_result, &pipeline_dir) {
        log::warn!("Failed to generate overlay: {e}");
    }

    // Step 7: Furniture planning
    log::info!("Step 7/7: Planning furniture layout with LLM...");
    scene_json = furniture::plan_furniture(&scene_json, data_dir).await?;
    log::info!(
        "Furniture: {} objects placed",
        scene_json.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
    );

    // Save pipeline artifacts
    save_pipeline_artifacts(
        project_id, &processed_path, &raw_result, &scene_json,
        &validation_report, &repair_actions, data_dir,
    )?;

    Ok(scene_json)
}

/// Hybrid CV+VLM pipeline: CV extracts wall geometry, VLM provides semantics.
async fn run_hybrid_pipeline(
    image_path: &str,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_id: &str,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    log::info!("=== Hybrid CV+VLM Pipeline ===");

    let pipeline_dir = data_dir.join("pipeline").join(project_id);
    let _ = std::fs::create_dir_all(&pipeline_dir);

    // Step 1: Preprocess image
    log::info!("Step 1/12: Preprocessing image...");
    let processed_path = preprocess::preprocess_floor_plan(image_path)?;

    // Get image dimensions
    let img_dims = image::image_dimensions(&processed_path)
        .map_err(|e| format!("Cannot read image dimensions: {e}"))?;
    let (img_w, img_h) = img_dims;

    // Step 2: Extract wall mask (CV)
    log::info!("Step 2/12: Extracting wall mask...");
    let wall_mask_path = match wall_mask::extract_wall_mask(&processed_path, &pipeline_dir) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("Wall mask extraction failed: {e}. Falling back to legacy.");
            return run_legacy_pipeline(image_path, style, ceiling_height, wall_thickness, project_id, data_dir).await;
        }
    };

    // Step 3: Build wall graph (CV)
    log::info!("Step 3/12: Building wall graph...");
    let wall_graph = match wall_graph::build_wall_graph(&wall_mask_path, &pipeline_dir) {
        Ok(g) => g,
        Err(e) => {
            log::warn!("Wall graph build failed: {e}. Falling back to legacy.");
            return run_legacy_pipeline(image_path, style, ceiling_height, wall_thickness, project_id, data_dir).await;
        }
    };

    if wall_graph.segments.len() < 3 {
        log::warn!("Only {} CV segments found, falling back to legacy", wall_graph.segments.len());
        return run_legacy_pipeline(image_path, style, ceiling_height, wall_thickness, project_id, data_dir).await;
    }

    // Step 4: VLM semantic parse (hybrid prompt)
    log::info!("Step 4/12: VLM semantic parse...");
    let config = crate::settings::get_llm_config_for(data_dir, "vlm");
    let vlm_response = if config.api_key.is_empty() {
        log::warn!("LLM API key not configured, proceeding without VLM semantics");
        serde_json::json!({
            "detected_rooms": [],
            "detected_doors": [],
            "detected_windows": [],
            "scale_info": {"detected": false},
            "warnings": ["VLM not configured"]
        })
    } else {
        match crate::ai::client::call_vlm_hybrid(&processed_path, &config, data_dir).await {
            Ok(resp) => {
                log::info!(
                    "VLM: {} rooms, {} doors, {} windows",
                    resp.get("detected_rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                    resp.get("detected_doors").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                    resp.get("detected_windows").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
                );
                resp
            }
            Err(e) => {
                log::warn!("VLM call failed: {e}. Proceeding with CV geometry only.");
                serde_json::json!({
                    "detected_rooms": [],
                    "detected_doors": [],
                    "detected_windows": [],
                    "scale_info": {"detected": false},
                    "warnings": [format!("VLM failed: {e}")]
                })
            }
        }
    };

    // Step 5: Build PlanGraphJSON
    log::info!("Step 5/12: Building PlanGraphJSON...");
    let mut pg = plan_graph::build_plan_graph(&wall_graph, &vlm_response, img_w, img_h);

    // Step 6: Convert PlanGraphJSON → HomeSceneJSON
    log::info!("Step 6/12: Converting to HomeSceneJSON...");
    let mut scene_json = convert::convert_plan_graph_to_scene(
        &pg, style, ceiling_height, wall_thickness, "Untitled", project_id,
    );

    // Step 7: Geometry repair
    log::info!("Step 7/12: Repairing geometry...");
    let repair_actions = repair::repair_scene(&mut scene_json);
    log::info!("Repair: {} action(s)", repair_actions.len());

    // Step 8: Compute alignment scores
    log::info!("Step 8/12: Computing image alignment...");
    let alignment_scores = alignment::compute_alignment(
        &wall_mask_path, &pg, img_w, img_h, &pipeline_dir,
    );
    pg.alignment_scores = Some(plan_graph::AlignmentScores {
        wall_iou: alignment_scores.wall_iou,
        wall_precision: alignment_scores.wall_precision,
        wall_recall: alignment_scores.wall_recall,
        room_iou: 0.0,
        overall: alignment_scores.overall,
    });

    // Step 9: Validate (with alignment)
    log::info!("Step 9/12: Validating scene...");
    let validation_report = validate::validate_scene_with_alignment(
        &scene_json, &repair_actions, Some(&alignment_scores),
    );
    log_validation(&validation_report);

    // Inject parse_quality into scene JSON
    inject_parse_quality(&mut scene_json, &validation_report);

    // Step 10: Generate overlays
    log::info!("Step 10/12: Generating overlays...");
    if let Err(e) = overlay::generate_overlay(&processed_path, &vlm_response, &pipeline_dir) {
        log::warn!("Debug overlay failed: {e}");
    }
    let _diagnosis = overlay_alignment::generate_alignment_overlay(
        &processed_path, &wall_mask_path, &pg, &alignment_scores, &pipeline_dir,
    );

    // Step 11: Quality gate → furniture
    let pq = &validation_report.parse_quality;
    let should_plan_furniture = pq.geometry_score >= 0.8
        && pq.scale_score >= 0.9
        && pq.image_alignment_score >= 0.75
        && !pq.needs_user_review;

    if should_plan_furniture {
        log::info!("Step 11/12: Quality gate passed, planning furniture...");
        scene_json = furniture::plan_furniture(&scene_json, data_dir).await?;
        log::info!(
            "Furniture: {} objects placed",
            scene_json.get("objects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        );
    } else {
        log::info!(
            "Step 11/12: Quality gate SKIPPED furniture: geometry={:.2}, scale={:.2}, alignment={:.2}, needs_review={}",
            pq.geometry_score, pq.scale_score, pq.image_alignment_score, pq.needs_user_review
        );
    }

    // Step 12: Save pipeline artifacts
    log::info!("Step 12/12: Saving artifacts...");
    save_pipeline_artifacts(
        project_id, &processed_path, &vlm_response, &scene_json,
        &validation_report, &repair_actions, data_dir,
    )?;

    // Update plan_graph.json with final alignment scores
    if let Ok(json) = serde_json::to_string_pretty(&pg) {
        let _ = std::fs::write(pipeline_dir.join("plan_graph.json"), json);
    }

    Ok(scene_json)
}

/// Patch rooms with material refs.
fn patch_room_materials(scene_json: &mut serde_json::Value, style: &str) {
    if let Some(rooms) = scene_json.get_mut("rooms").and_then(|v| v.as_array_mut()) {
        for room in rooms.iter_mut() {
            let room_type = room.get("type").and_then(|v| v.as_str()).unwrap_or("living_room");
            room["floor_material"] = serde_json::Value::String(format!("mat_{style}_floor_{room_type}"));
            room["wall_material"] = serde_json::Value::String(format!("mat_{style}_wall"));
            room["ceiling_material"] = serde_json::Value::String(format!("mat_{style}_ceiling"));
        }
    }
}

/// Inject parse_quality into scene JSON for frontend access.
fn inject_parse_quality(scene_json: &mut serde_json::Value, report: &validate::ValidationReport) {
    let mut pq = serde_json::json!({
        "overall_score": report.score,
        "geometry_score": report.parse_quality.geometry_score,
        "semantic_score": report.parse_quality.semantic_score,
        "scale_score": report.parse_quality.scale_score,
        "needs_user_review": report.parse_quality.needs_user_review,
    });
    if let Some(ref alignment) = report.image_alignment {
        pq["image_alignment_score"] = serde_json::json!(report.parse_quality.image_alignment_score);
        pq["image_alignment"] = serde_json::json!({
            "wall_iou": alignment.wall_iou,
            "wall_precision": alignment.wall_precision,
            "wall_recall": alignment.wall_recall,
            "overall": alignment.overall,
        });
    }
    scene_json["parse_quality"] = pq;
}

fn log_validation(report: &validate::ValidationReport) {
    log::info!(
        "Validation: score={:.0}%, alignment={:.0}%, {} error(s), {} warning(s), needs_review={}",
        report.score * 100.0,
        report.parse_quality.image_alignment_score * 100.0,
        report.errors.len(),
        report.warnings.len(),
        report.parse_quality.needs_user_review,
    );
    for err in &report.errors {
        log::warn!("  Error: {}", err.message);
    }
    for warn in &report.warnings {
        log::info!("  Warning: {}", warn.message);
    }
}

fn save_pipeline_artifacts(
    project_id: &str,
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
    if let Ok(json) = serde_json::to_string_pretty(raw_vlm) {
        let _ = std::fs::write(pipeline_dir.join("vlm_response.json"), json);
    }

    // Save scene JSON
    if let Ok(json) = serde_json::to_string_pretty(scene_json) {
        let _ = std::fs::write(pipeline_dir.join("scene_normalized.json"), json);
    }

    // Save validation report
    if let Ok(json) = serde_json::to_string_pretty(validation_report) {
        let _ = std::fs::write(pipeline_dir.join("validation_report.json"), json);
    }

    // Save repair log
    if let Ok(json) = serde_json::to_string_pretty(repair_actions) {
        let _ = std::fs::write(pipeline_dir.join("repair_log.json"), json);
    }

    // Save meta
    let meta = serde_json::json!({
        "project_id": project_id,
        "pipeline_mode": if validation_report.image_alignment.is_some() { "hybrid_cv_vlm" } else { "legacy" },
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
            "image_alignment_score": validation_report.parse_quality.image_alignment_score,
            "error_count": validation_report.errors.len(),
            "warning_count": validation_report.warnings.len(),
            "repair_action_count": repair_actions.len(),
            "needs_user_review": validation_report.parse_quality.needs_user_review,
        },
        "alignment": validation_report.image_alignment.as_ref().map(|a| serde_json::json!({
            "wall_iou": a.wall_iou,
            "wall_precision": a.wall_precision,
            "wall_recall": a.wall_recall,
            "overall": a.overall,
        })),
    });
    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(pipeline_dir.join("meta.json"), json);
    }

    log::info!("Pipeline artifacts saved to {}", pipeline_dir.display());
    Ok(())
}
