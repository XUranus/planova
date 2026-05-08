use super::plan_graph::PlanGraphJSON;
use super::normalizer;

/// Convert PlanGraphJSON (pixel coordinates) to HomeSceneJSON (meter coordinates).
pub fn convert_plan_graph_to_scene(
    plan_graph: &PlanGraphJSON,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_name: &str,
    project_id: &str,
) -> serde_json::Value {
    // Determine scale from best scale candidate
    let meters_per_pixel = plan_graph
        .scale_candidates
        .iter()
        .max_by(|a, b| a.confidence.partial_cmp(&b.confidence).unwrap_or(std::cmp::Ordering::Equal))
        .map(|c| c.meters_per_pixel)
        .unwrap_or(0.0075);

    log::info!("Converting PlanGraphJSON → HomeSceneJSON (mpp={:.5})", meters_per_pixel);

    // Convert faces → rooms
    let rooms: Vec<serde_json::Value> = plan_graph
        .faces
        .iter()
        .enumerate()
        .map(|(i, face)| {
            // Find matching label
            let label = face
                .label_ref
                .as_ref()
                .and_then(|lid| plan_graph.labels.iter().find(|l| &l.id == lid));

            let room_type = label.map(|l| l.room_type.as_str()).unwrap_or("living_room");
            let name = label.map(|l| l.name.as_str()).unwrap_or("Unknown");

            // Convert polygon from pixels to meters
            let polygon_m: Vec<[f64; 2]> = face
                .polygon
                .iter()
                .map(|p| {
                    [
                        (p[0] * meters_per_pixel * 1000.0).round() / 1000.0,
                        (p[1] * meters_per_pixel * 1000.0).round() / 1000.0,
                    ]
                })
                .collect();

            let area = normalizer::polygon_area(&polygon_m);

            serde_json::json!({
                "id": format!("room_{}", i + 1),
                "type": room_type,
                "name": name,
                "polygon": polygon_m,
                "area": (area * 100.0).round() / 100.0,
                "floor_material": format!("mat_{style}_floor_{room_type}"),
                "wall_material": format!("mat_{style}_wall"),
                "ceiling_material": format!("mat_{style}_ceiling"),
            })
        })
        .collect();

    // Convert wall segments → walls (in meters)
    let walls: Vec<serde_json::Value> = plan_graph
        .wall_segments
        .iter()
        .enumerate()
        .map(|(i, seg)| {
            let sx = (seg.start[0] * meters_per_pixel * 1000.0).round() / 1000.0;
            let sy = (seg.start[1] * meters_per_pixel * 1000.0).round() / 1000.0;
            let ex = (seg.end[0] * meters_per_pixel * 1000.0).round() / 1000.0;
            let ey = (seg.end[1] * meters_per_pixel * 1000.0).round() / 1000.0;

            serde_json::json!({
                "id": format!("wall_{}", i + 1),
                "start": [sx, sy],
                "end": [ex, ey],
                "height": ceiling_height,
                "thickness": wall_thickness,
                "room_refs": find_wall_room_refs(&[sx, sy], &[ex, ey], &rooms),
            })
        })
        .collect();

    // Convert doors → openings
    let mut openings = Vec::new();
    let mut idx = 0;

    for door in &plan_graph.doors {
        idx += 1;
        let px = (door.position[0] * meters_per_pixel * 1000.0).round() / 1000.0;
        let py = (door.position[1] * meters_per_pixel * 1000.0).round() / 1000.0;
        let wall_ref = find_nearest_wall_id(&[px, py], &walls);

        openings.push(serde_json::json!({
            "id": format!("door_{idx}"),
            "type": "door",
            "wall_ref": wall_ref,
            "position": [px, py],
            "width": (door.width_meters * 100.0).round() / 100.0,
            "height": 2.1,
            "sill_height": 0,
            "swing": door.swing_direction,
        }));
    }

    for win in &plan_graph.windows {
        idx += 1;
        let px = (win.position[0] * meters_per_pixel * 1000.0).round() / 1000.0;
        let py = (win.position[1] * meters_per_pixel * 1000.0).round() / 1000.0;
        let wall_ref = find_nearest_wall_id(&[px, py], &walls);

        openings.push(serde_json::json!({
            "id": format!("window_{idx}"),
            "type": "window",
            "wall_ref": wall_ref,
            "position": [px, py],
            "width": (win.width_meters * 100.0).round() / 100.0,
            "height": 1.2,
            "sill_height": 0.9,
        }));
    }

    // Generate materials, cameras, lights using normalizer functions
    let materials = normalizer::generate_materials(style, &rooms);
    let cameras = normalizer::generate_cameras(&rooms, ceiling_height);
    let lights = normalizer::generate_lights(&rooms, ceiling_height);

    serde_json::json!({
        "schema_version": "0.2.0",
        "project": {
            "id": project_id,
            "name": project_name,
            "unit": "meter",
        },
        "global": {
            "style": style,
            "ceiling_height": ceiling_height,
            "wall_thickness": wall_thickness,
        },
        "rooms": rooms,
        "walls": walls,
        "openings": openings,
        "objects": [],
        "materials": materials,
        "lights": lights,
        "cameras": cameras,
    })
}

/// Find which rooms a wall segment borders (by proximity to room polygon edges).
fn find_wall_room_refs(
    wall_start: &[f64; 2],
    wall_end: &[f64; 2],
    rooms: &[serde_json::Value],
) -> Vec<String> {
    let mut refs = Vec::new();
    let wall_mid = [
        (wall_start[0] + wall_end[0]) / 2.0,
        (wall_start[1] + wall_end[1]) / 2.0,
    ];

    for room in rooms {
        let room_id = room.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let polygon = match room.get("polygon").and_then(|v| v.as_array()) {
            Some(p) => p,
            None => continue,
        };

        // Check if wall midpoint is near any polygon edge
        for i in 0..polygon.len() {
            let j = (i + 1) % polygon.len();
            let p1 = &polygon[i];
            let p2 = &polygon[j];
            let a = [
                p1.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                p1.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            ];
            let b = [
                p2.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                p2.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            ];
            let dist = point_to_segment_dist(&wall_mid, &a, &b);
            if dist < 0.8 {
                refs.push(room_id.to_string());
                break;
            }
        }
    }

    refs
}

/// Find the nearest wall to a point.
fn find_nearest_wall_id(point: &[f64; 2], walls: &[serde_json::Value]) -> String {
    let mut min_dist = f64::INFINITY;
    let mut nearest = String::new();

    for wall in walls {
        let start = wall.get("start").and_then(|v| v.as_array());
        let end = wall.get("end").and_then(|v| v.as_array());
        if let (Some(s), Some(e)) = (start, end) {
            let a = [
                s.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                s.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            ];
            let b = [
                e.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                e.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            ];
            let dist = point_to_segment_dist(point, &a, &b);
            if dist < min_dist {
                min_dist = dist;
                nearest = wall.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            }
        }
    }

    nearest
}

fn point_to_segment_dist(p: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if dx == 0.0 && dy == 0.0 {
        return ((p[0] - a[0]).powi(2) + (p[1] - a[1]).powi(2)).sqrt();
    }
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    let t = t.clamp(0.0, 1.0);
    let proj_x = a[0] + t * dx;
    let proj_y = a[1] + t * dy;
    ((p[0] - proj_x).powi(2) + (p[1] - proj_y).powi(2)).sqrt()
}
