use std::collections::HashMap;
use std::path::Path;

use crate::ai::client as ai_client;
use crate::settings;

const CATEGORY_SIZES: &[(&str, [f64; 3])] = &[
    ("sofa", [2.2, 0.85, 0.9]),
    ("coffee_table", [1.2, 0.45, 0.6]),
    ("tv_stand", [1.8, 0.5, 0.4]),
    ("bed_double", [2.0, 0.55, 1.6]),
    ("bed_single", [2.0, 0.55, 1.0]),
    ("nightstand", [0.5, 0.55, 0.4]),
    ("wardrobe", [1.8, 2.2, 0.6]),
    ("dining_table", [1.6, 0.75, 0.9]),
    ("dining_chair", [0.45, 0.9, 0.45]),
    ("desk", [1.4, 0.75, 0.7]),
    ("bookshelf", [1.0, 2.0, 0.35]),
    ("bathroom_sink", [0.6, 0.85, 0.5]),
    ("toilet", [0.4, 0.75, 0.65]),
    ("shower", [1.0, 2.1, 1.0]),
    ("kitchen_counter", [2.4, 0.9, 0.6]),
    ("fridge", [0.7, 1.8, 0.65]),
];

fn category_sizes() -> HashMap<&'static str, [f64; 3]> {
    CATEGORY_SIZES.iter().copied().collect()
}

pub async fn plan_furniture(
    scene: &serde_json::Value,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    let mut scene = scene.clone();

    let rooms = scene
        .get("rooms")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if rooms.is_empty() {
        return Ok(scene);
    }

    // Skip if only balcony/corridor rooms
    let placeable: Vec<&serde_json::Value> = rooms
        .iter()
        .filter(|r| {
            let t = r.get("type").and_then(|v| v.as_str()).unwrap_or("");
            t != "balcony" && t != "corridor"
        })
        .collect();
    if placeable.is_empty() {
        return Ok(scene);
    }

    let config = settings::get_llm_config(data_dir);
    if config.api_key.is_empty() {
        log::warn!("LLM API key not configured, skipping furniture planning");
        return Ok(scene);
    }

    // Build compact rooms input
    let openings = scene
        .get("openings")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let rooms_input: Vec<serde_json::Value> = rooms
        .iter()
        .map(|room| {
            let polygon = room
                .get("polygon")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            // Find openings near this room (AABB proximity)
            let xs: Vec<f64> = polygon
                .iter()
                .filter_map(|p| p.get(0).and_then(|v| v.as_f64()))
                .collect();
            let zs: Vec<f64> = polygon
                .iter()
                .filter_map(|p| p.get(1).and_then(|v| v.as_f64()))
                .collect();
            let room_openings: Vec<serde_json::Value> = if !xs.is_empty() && !zs.is_empty() {
                let min_x = xs.iter().copied().fold(f64::INFINITY, f64::min) - 0.5;
                let max_x = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max) + 0.5;
                let min_z = zs.iter().copied().fold(f64::INFINITY, f64::min) - 0.5;
                let max_z = zs.iter().copied().fold(f64::NEG_INFINITY, f64::max) + 0.5;
                openings
                    .iter()
                    .filter(|op| {
                        let pos = op.get("position").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                        if let (Some(px), Some(pz)) = (
                            pos.get(0).and_then(|v| v.as_f64()),
                            pos.get(1).and_then(|v| v.as_f64()),
                        ) {
                            px >= min_x && px <= max_x && pz >= min_z && pz <= max_z
                        } else {
                            false
                        }
                    })
                    .map(|op| {
                        serde_json::json!({
                            "type": op.get("type").cloned().unwrap_or_default(),
                            "position": op.get("position").cloned().unwrap_or_default(),
                            "width": op.get("width").cloned().unwrap_or_default(),
                        })
                    })
                    .collect()
            } else {
                vec![]
            };

            serde_json::json!({
                "id": room.get("id").cloned().unwrap_or_default(),
                "type": room.get("type").cloned().unwrap_or_default(),
                "name": room.get("name").cloned().unwrap_or_default(),
                "area": room.get("area").and_then(|v| v.as_f64()).unwrap_or(0.0),
                "polygon": polygon,
                "openings": room_openings,
            })
        })
        .collect();

    let style = scene
        .get("global")
        .and_then(|g| g.get("style"))
        .and_then(|v| v.as_str())
        .unwrap_or("modern_luxury");

    let user_msg = crate::ai::prompts::FURNITURE_PLANNER_USER_TEMPLATE
        .replace("{style}", style)
        .replace(
            "{rooms_json}",
            &serde_json::to_string_pretty(&rooms_input).unwrap_or_default(),
        );

    let messages = vec![
        serde_json::json!({
            "role": "system",
            "content": crate::ai::prompts::FURNITURE_PLANNER_SYSTEM,
        }),
        serde_json::json!({
            "role": "user",
            "content": user_msg,
        }),
    ];

    log::info!(
        "Calling LLM for furniture planning ({} rooms)",
        placeable.len()
    );

    match ai_client::call_llm_text(&messages, &config, data_dir, 4096).await {
        Ok(response_text) => {
            match ai_client::extract_json(&response_text) {
                Ok(parsed) => {
                    let raw_objects = parsed
                        .get("objects")
                        .and_then(|v| v.as_array())
                        .cloned()
                        .unwrap_or_default();

                    if raw_objects.is_empty() {
                        return Ok(scene);
                    }

                    let sizes = category_sizes();

                    // Build room lookup
                    let room_lookup: HashMap<String, &serde_json::Value> = rooms
                        .iter()
                        .filter_map(|r| {
                            r.get("id")
                                .and_then(|v| v.as_str())
                                .map(|id| (id.to_string(), r))
                        })
                        .collect();

                    let mut objects = Vec::new();
                    for (i, obj) in raw_objects.iter().enumerate() {
                        let category = obj
                            .get("category")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if !sizes.contains_key(category) {
                            log::warn!("Skipping unknown category: {category}");
                            continue;
                        }

                        let position = obj
                            .get("position")
                            .and_then(|v| v.as_array())
                            .cloned()
                            .unwrap_or_default();
                        if position.len() < 2 {
                            continue;
                        }

                        let room_id = obj
                            .get("room_id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let room = match room_lookup.get(room_id) {
                            Some(r) => *r,
                            None => {
                                log::warn!("Skipping object in unknown room: {room_id}");
                                continue;
                            }
                        };

                        let pos_x = position.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let pos_z = position.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);

                        // Simple AABB check
                        let polygon = room
                            .get("polygon")
                            .and_then(|v| v.as_array())
                            .cloned()
                            .unwrap_or_default();
                        let xs: Vec<f64> = polygon
                            .iter()
                            .filter_map(|p| p.get(0).and_then(|v| v.as_f64()))
                            .collect();
                        let zs: Vec<f64> = polygon
                            .iter()
                            .filter_map(|p| p.get(1).and_then(|v| v.as_f64()))
                            .collect();
                        if !xs.is_empty() && !zs.is_empty() {
                            let min_x = xs.iter().copied().fold(f64::INFINITY, f64::min) - 0.3;
                            let max_x = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max) + 0.3;
                            let min_z = zs.iter().copied().fold(f64::INFINITY, f64::min) - 0.3;
                            let max_z = zs.iter().copied().fold(f64::NEG_INFINITY, f64::max) + 0.3;
                            if pos_x < min_x || pos_x > max_x || pos_z < min_z || pos_z > max_z {
                                log::warn!(
                                    "Skipping object outside room bounds: {category} at [{pos_x}, {pos_z}] in {room_id}"
                                );
                                continue;
                            }
                        }

                        let rotation = obj
                            .get("rotation")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        let size = sizes[category];

                        objects.push(serde_json::json!({
                            "id": format!("furniture_{}", i + 1),
                            "type": "furniture",
                            "category": category,
                            "room_ref": room_id,
                            "position": [pos_x, 0, pos_z],
                            "rotation": [0, rotation, 0],
                            "scale": [1, 1, 1],
                            "size": size,
                        }));
                    }

                    log::info!(
                        "Furniture planner: {}/{} objects validated",
                        objects.len(),
                        raw_objects.len()
                    );

                    if !objects.is_empty() {
                        scene["objects"] = serde_json::Value::Array(objects);
                    }

                    Ok(scene)
                }
                Err(e) => {
                    log::warn!("Failed to parse furniture planner response: {e}");
                    Ok(scene)
                }
            }
        }
        Err(e) => {
            log::warn!("Furniture planning LLM call failed: {e}");
            Ok(scene)
        }
    }
}
