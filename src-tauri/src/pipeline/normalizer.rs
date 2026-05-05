use std::collections::{HashMap, HashSet};

pub fn normalize_scene(
    raw: &serde_json::Value,
    style: &str,
    ceiling_height: f64,
    wall_thickness: f64,
    project_name: &str,
    project_id: &str,
) -> serde_json::Value {
    let rooms = raw.get("detected_rooms").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let walls = raw.get("detected_walls").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let doors = raw.get("detected_doors").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let windows = raw.get("detected_windows").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let scale_info = raw.get("scale_info").cloned().unwrap_or_default();

    // Determine scale
    let mut meters_per_pixel = scale_info
        .get("meters_per_pixel")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.02);
    if !scale_info.get("detected").and_then(|v| v.as_bool()).unwrap_or(false) {
        let overall = raw.get("overall_dimensions").cloned().unwrap_or_default();
        if let Some(width_m) = overall.get("width_meters").and_then(|v| v.as_f64()) {
            if width_m > 0.0 {
                meters_per_pixel = estimate_scale_from_bbox(&rooms, &overall);
            }
        }
    }

    let norm_rooms = normalize_rooms(&rooms, meters_per_pixel);
    let norm_walls = normalize_walls(&walls, meters_per_pixel, wall_thickness, ceiling_height, &norm_rooms);
    let norm_openings = normalize_openings(&doors, &windows, meters_per_pixel, &norm_walls);
    let materials = generate_materials(style, &norm_rooms);
    let cameras = generate_cameras(&norm_rooms, ceiling_height);
    let lights = generate_lights(&norm_rooms, ceiling_height);

    serde_json::json!({
        "schema_version": "0.1.0",
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
        "rooms": norm_rooms,
        "walls": norm_walls,
        "openings": norm_openings,
        "objects": [],
        "materials": materials,
        "lights": lights,
        "cameras": cameras,
    })
}

fn estimate_scale_from_bbox(rooms: &[serde_json::Value], overall: &serde_json::Value) -> f64 {
    if rooms.is_empty() {
        return 0.02;
    }
    let mut all_points: Vec<(f64, f64)> = Vec::new();
    for room in rooms {
        if let Some(polygon) = room.get("polygon").and_then(|v| v.as_array()) {
            for p in polygon {
                if let (Some(x), Some(y)) = (
                    p.get(0).and_then(|v| v.as_f64()),
                    p.get(1).and_then(|v| v.as_f64()),
                ) {
                    all_points.push((x, y));
                }
            }
        }
    }
    if all_points.is_empty() {
        return 0.02;
    }
    let xs: Vec<f64> = all_points.iter().map(|p| p.0).collect();
    let ys: Vec<f64> = all_points.iter().map(|p| p.1).collect();
    let pixel_width = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - xs.iter().copied().fold(f64::INFINITY, f64::min);
    let pixel_height = ys.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - ys.iter().copied().fold(f64::INFINITY, f64::min);
    if pixel_width <= 0.0 || pixel_height <= 0.0 {
        return 0.02;
    }
    let real_width = overall.get("width_meters").and_then(|v| v.as_f64()).unwrap_or(10.0);
    let real_height = overall.get("height_meters").and_then(|v| v.as_f64()).unwrap_or(10.0);
    (real_width / pixel_width).min(real_height / pixel_height)
}

fn normalize_rooms(rooms: &[serde_json::Value], scale: f64) -> Vec<serde_json::Value> {
    rooms
        .iter()
        .enumerate()
        .map(|(i, room)| {
            let polygon_px = room
                .get("polygon")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let polygon_m: Vec<[f64; 2]> = polygon_px
                .iter()
                .map(|p| {
                    let x = p.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
                    let y = p.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
                    [(x * 1000.0).round() / 1000.0, (y * 1000.0).round() / 1000.0]
                })
                .collect();
            let room_type = room
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("living_room");
            let name = room
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Room {}", i + 1));
            let area = polygon_area(&polygon_m);

            serde_json::json!({
                "id": format!("room_{}", i + 1),
                "type": room_type,
                "name": name,
                "polygon": polygon_m,
                "area": (area * 100.0).round() / 100.0,
            })
        })
        .collect()
}

fn normalize_walls(
    walls: &[serde_json::Value],
    scale: f64,
    thickness: f64,
    height: f64,
    rooms: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let mut result: Vec<serde_json::Value> = walls
        .iter()
        .enumerate()
        .map(|(i, wall)| {
            let start = wall.get("start").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let end = wall.get("end").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let sx = start.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
            let sy = start.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
            let ex = end.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
            let ey = end.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
            serde_json::json!({
                "id": format!("wall_{}", i + 1),
                "start": [(sx * 1000.0).round() / 1000.0, (sy * 1000.0).round() / 1000.0],
                "end": [(ex * 1000.0).round() / 1000.0, (ey * 1000.0).round() / 1000.0],
                "height": height,
                "thickness": thickness,
                "room_refs": rooms.iter().take(2).filter_map(|r| r.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect::<Vec<_>>(),
            })
        })
        .collect();

    if result.is_empty() && !rooms.is_empty() {
        result = generate_walls_from_rooms(rooms, thickness, height);
    }

    result
}

fn generate_walls_from_rooms(
    rooms: &[serde_json::Value],
    thickness: f64,
    height: f64,
) -> Vec<serde_json::Value> {
    let mut walls = Vec::new();
    let mut seen_edges: HashSet<((i64, i64), (i64, i64))> = HashSet::new();
    let mut wall_idx = 0;

    for room in rooms {
        let polygon = room
            .get("polygon")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let room_id = room
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        for i in 0..polygon.len() {
            let j = (i + 1) % polygon.len();
            let p1 = &polygon[i];
            let p2 = &polygon[j];
            let (x1, y1) = (
                p1.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                p1.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            );
            let (x2, y2) = (
                p2.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
                p2.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
            );

            // Normalize edge direction for dedup
            let k1 = ((x1 * 1000.0) as i64, (y1 * 1000.0) as i64);
            let k2 = ((x2 * 1000.0) as i64, (y2 * 1000.0) as i64);
            let edge_key = if k1 < k2 { (k1, k2) } else { (k2, k1) };
            if seen_edges.contains(&edge_key) {
                continue;
            }
            seen_edges.insert(edge_key);

            wall_idx += 1;
            walls.push(serde_json::json!({
                "id": format!("wall_{wall_idx}"),
                "start": [x1, y1],
                "end": [x2, y2],
                "height": height,
                "thickness": thickness,
                "room_refs": [room_id],
            }));
        }
    }

    walls
}

fn normalize_openings(
    doors: &[serde_json::Value],
    windows: &[serde_json::Value],
    scale: f64,
    walls: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let mut result = Vec::new();
    let mut idx = 0;

    for door in doors {
        idx += 1;
        let pos = door.get("position").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let px = pos.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
        let py = pos.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
        let pos_m = [(px * 1000.0).round() / 1000.0, (py * 1000.0).round() / 1000.0];
        let wall_ref = find_nearest_wall(&pos_m, walls);
        let width = door.get("width").and_then(|v| v.as_f64()).unwrap_or(0.9);
        let swing = door
            .get("swing_direction")
            .and_then(|v| v.as_str())
            .unwrap_or("left_inward");

        result.push(serde_json::json!({
            "id": format!("door_{idx}"),
            "type": "door",
            "wall_ref": wall_ref,
            "position": pos_m,
            "width": (width * 100.0).round() / 100.0,
            "height": 2.1,
            "sill_height": 0,
            "swing": swing,
        }));
    }

    for window in windows {
        idx += 1;
        let pos = window.get("position").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let px = pos.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
        let py = pos.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) * scale;
        let pos_m = [(px * 1000.0).round() / 1000.0, (py * 1000.0).round() / 1000.0];
        let wall_ref = find_nearest_wall(&pos_m, walls);
        let width = window.get("width").and_then(|v| v.as_f64()).unwrap_or(1.2);

        result.push(serde_json::json!({
            "id": format!("window_{idx}"),
            "type": "window",
            "wall_ref": wall_ref,
            "position": pos_m,
            "width": (width * 100.0).round() / 100.0,
            "height": 1.2,
            "sill_height": 0.9,
        }));
    }

    result
}

fn find_nearest_wall(point: &[f64; 2], walls: &[serde_json::Value]) -> String {
    if walls.is_empty() {
        return String::new();
    }
    let mut min_dist = f64::INFINITY;
    let mut nearest_id = String::new();

    for wall in walls {
        let start = wall.get("start").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let end = wall.get("end").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let a = [
            start.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
            start.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
        ];
        let b = [
            end.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
            end.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
        ];
        let dist = point_to_segment_distance(point, &a, &b);
        if dist < min_dist {
            min_dist = dist;
            nearest_id = wall
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }
    }

    nearest_id
}

fn point_to_segment_distance(p: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
    let (ax, ay) = (a[0], a[1]);
    let (bx, by) = (b[0], b[1]);
    let (px, py) = (p[0], p[1]);
    let dx = bx - ax;
    let dy = by - ay;
    if dx == 0.0 && dy == 0.0 {
        return ((px - ax).powi(2) + (py - ay).powi(2)).sqrt();
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    let t = t.clamp(0.0, 1.0);
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;
    ((px - proj_x).powi(2) + (py - proj_y).powi(2)).sqrt()
}

fn polygon_area(polygon: &[[f64; 2]]) -> f64 {
    let n = polygon.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += polygon[i][0] * polygon[j][1];
        area -= polygon[j][0] * polygon[i][1];
    }
    area.abs() / 2.0
}

fn generate_cameras(rooms: &[serde_json::Value], _ceiling_height: f64) -> Vec<serde_json::Value> {
    let mut cameras = Vec::new();

    let mut all_points: Vec<(f64, f64)> = Vec::new();
    for room in rooms {
        if let Some(polygon) = room.get("polygon").and_then(|v| v.as_array()) {
            for p in polygon {
                if let (Some(x), Some(z)) = (
                    p.get(0).and_then(|v| v.as_f64()),
                    p.get(1).and_then(|v| v.as_f64()),
                ) {
                    all_points.push((x, z));
                }
            }
        }
    }

    if all_points.is_empty() {
        cameras.push(serde_json::json!({
            "id": "cam_overview", "name": "Overview", "type": "perspective",
            "position": [5, 8, 10], "target": [5, 0, 5], "fov": 50
        }));
        return cameras;
    }

    let xs: Vec<f64> = all_points.iter().map(|p| p.0).collect();
    let zs: Vec<f64> = all_points.iter().map(|p| p.1).collect();
    let min_x = xs.iter().copied().fold(f64::INFINITY, f64::min);
    let max_x = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let min_z = zs.iter().copied().fold(f64::INFINITY, f64::min);
    let max_z = zs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let cx = (min_x + max_x) / 2.0;
    let cz = (min_z + max_z) / 2.0;
    let extent = (max_x - min_x).max(max_z - min_z);

    cameras.push(serde_json::json!({
        "id": "cam_overview",
        "name": "Overview",
        "type": "perspective",
        "position": [cx, extent * 0.8, cz + extent],
        "target": [cx, 0, cz],
        "fov": 50,
    }));

    for (i, room) in rooms.iter().enumerate() {
        let polygon = room
            .get("polygon")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if polygon.is_empty() {
            continue;
        }
        let rxs: Vec<f64> = polygon
            .iter()
            .filter_map(|p| p.get(0).and_then(|v| v.as_f64()))
            .collect();
        let rzs: Vec<f64> = polygon
            .iter()
            .filter_map(|p| p.get(1).and_then(|v| v.as_f64()))
            .collect();
        let rcx = (rxs.iter().copied().fold(f64::INFINITY, f64::min)
            + rxs.iter().copied().fold(f64::NEG_INFINITY, f64::max))
            / 2.0;
        let rcz = (rzs.iter().copied().fold(f64::INFINITY, f64::min)
            + rzs.iter().copied().fold(f64::NEG_INFINITY, f64::max))
            / 2.0;
        let name = room
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Room {}", i + 1));
        let room_id = room
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        cameras.push(serde_json::json!({
            "id": format!("cam_{room_id}"),
            "name": name,
            "type": "perspective",
            "position": [rcx - 1.5, 1.6, rcz - 1.5],
            "target": [rcx, 1.2, rcz],
            "fov": 65,
        }));
    }

    cameras
}

fn generate_lights(rooms: &[serde_json::Value], ceiling_height: f64) -> Vec<serde_json::Value> {
    let light_y = ceiling_height - 0.15;
    let mut lights = Vec::new();

    for (_i, room) in rooms.iter().enumerate() {
        let polygon = room
            .get("polygon")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if polygon.is_empty() {
            continue;
        }
        let xs: Vec<f64> = polygon
            .iter()
            .filter_map(|p| p.get(0).and_then(|v| v.as_f64()))
            .collect();
        let zs: Vec<f64> = polygon
            .iter()
            .filter_map(|p| p.get(1).and_then(|v| v.as_f64()))
            .collect();
        let cx = (xs.iter().copied().fold(f64::INFINITY, f64::min)
            + xs.iter().copied().fold(f64::NEG_INFINITY, f64::max))
            / 2.0;
        let cz = (zs.iter().copied().fold(f64::INFINITY, f64::min)
            + zs.iter().copied().fold(f64::NEG_INFINITY, f64::max))
            / 2.0;

        let room_type = room.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let is_main = room_type == "living_room" || room_type == "bedroom";
        let name = room
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Room");
        let room_id = room.get("id").and_then(|v| v.as_str()).unwrap_or("");

        let mut light = serde_json::json!({
            "id": format!("light_{room_id}"),
            "type": if is_main { "area" } else { "point" },
            "name": format!("{name} Light"),
            "position": [cx, light_y, cz],
            "rotation": [0, 0, 0],
            "intensity": if is_main { 500 } else { 350 },
            "color": if is_main { "#fff4e6" } else { "#ffffff" },
        });
        if is_main {
            light["size"] = serde_json::json!([1.5, 1.5]);
        }
        lights.push(light);
    }

    lights
}

pub fn generate_materials(style: &str, rooms: &[serde_json::Value]) -> Vec<serde_json::Value> {
    let palettes = style_palettes();
    let palette = palettes.get(style).or_else(|| palettes.get("modern_luxury")).cloned().unwrap_or_default();

    let wall_props = palette.get("wall").cloned().unwrap_or_default();
    let ceiling_props = palette.get("ceiling").cloned().unwrap_or_default();
    let door_props = palette.get("door").cloned().unwrap_or_default();
    let window_props = palette.get("window").cloned().unwrap_or_default();
    let floor_map = palette.get("floor").and_then(|v| v.as_object()).cloned().unwrap_or_default();

    let wall_id = format!("mat_{style}_wall");
    let ceiling_id = format!("mat_{style}_ceiling");

    fn make_material(id: &str, name: &str, props: &serde_json::Value) -> serde_json::Value {
        let mut obj = serde_json::Map::new();
        obj.insert("id".into(), serde_json::Value::String(id.to_string()));
        obj.insert("type".into(), serde_json::Value::String("pbr".into()));
        obj.insert("name".into(), serde_json::Value::String(name.to_string()));
        if let Some(p) = props.as_object() {
            for (k, v) in p {
                obj.insert(k.clone(), v.clone());
            }
        }
        serde_json::Value::Object(obj)
    }

    let mut materials = vec![
        make_material(&wall_id, &format!("{style} Wall"), &wall_props),
        make_material(&ceiling_id, &format!("{style} Ceiling"), &ceiling_props),
        make_material(&format!("mat_{style}_door"), &format!("{style} Door"), &door_props),
        make_material(&format!("mat_{style}_window"), &format!("{style} Window"), &window_props),
    ];

    // Floor materials per room type
    let mut used_types: HashSet<String> = HashSet::new();
    for room in rooms {
        let room_type = room
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("living_room")
            .to_string();
        used_types.insert(room_type);
    }

    for room_type in &used_types {
        let floor_spec = floor_map
            .get(room_type)
            .or_else(|| floor_map.get("living_room"))
            .cloned()
            .unwrap_or_default();
        let floor_id = format!("mat_{style}_floor_{room_type}");
        materials.push(make_material(&floor_id, &format!("{style} Floor {room_type}"), &floor_spec));
    }

    // Note: we can't mutate rooms here since they're passed as reference
    // The caller will need to assign material refs to rooms
    // For now we return materials and the rooms already have their material refs
    // set during normalization... actually in the Python code, material refs are
    // assigned to rooms inside _generate_materials. We need to handle this differently.
    // The caller (normalize_scene) should patch rooms with material refs after this call.

    materials
}

fn style_palettes() -> HashMap<String, serde_json::Value> {
    let mut m = HashMap::new();
    m.insert("modern_luxury".to_string(), serde_json::json!({
        "wall": {"base_color": "#C8C0B8", "roughness": 0.85, "metalness": 0.0},
        "ceiling": {"base_color": "#F0EDE8", "roughness": 0.9, "metalness": 0.0},
        "door": {"base_color": "#4A3728", "roughness": 0.5, "metalness": 0.1},
        "window": {"base_color": "#B5D4E8", "roughness": 0.1, "metalness": 0.0},
        "floor": {
            "living_room": {"base_color": "#6B4F3A", "roughness": 0.6, "metalness": 0.0},
            "bedroom": {"base_color": "#7A6050", "roughness": 0.65, "metalness": 0.0},
            "kitchen": {"base_color": "#8A8078", "roughness": 0.5, "metalness": 0.05},
            "bathroom": {"base_color": "#A0A0A0", "roughness": 0.3, "metalness": 0.0},
            "dining_room": {"base_color": "#6B4F3A", "roughness": 0.6, "metalness": 0.0},
            "corridor": {"base_color": "#6B4F3A", "roughness": 0.6, "metalness": 0.0},
            "study": {"base_color": "#5A4A3A", "roughness": 0.6, "metalness": 0.0},
            "balcony": {"base_color": "#9A9088", "roughness": 0.4, "metalness": 0.0},
        }
    }));
    m.insert("cream".to_string(), serde_json::json!({
        "wall": {"base_color": "#F5F0E6", "roughness": 0.9, "metalness": 0.0},
        "ceiling": {"base_color": "#FFFFFF", "roughness": 0.95, "metalness": 0.0},
        "door": {"base_color": "#B89B71", "roughness": 0.55, "metalness": 0.0},
        "window": {"base_color": "#C8DDE8", "roughness": 0.15, "metalness": 0.0},
        "floor": {
            "living_room": {"base_color": "#D4B896", "roughness": 0.65, "metalness": 0.0},
            "bedroom": {"base_color": "#DEC8A8", "roughness": 0.7, "metalness": 0.0},
            "kitchen": {"base_color": "#E0D8C8", "roughness": 0.45, "metalness": 0.0},
            "bathroom": {"base_color": "#D8D0C8", "roughness": 0.3, "metalness": 0.0},
            "dining_room": {"base_color": "#D4B896", "roughness": 0.65, "metalness": 0.0},
            "corridor": {"base_color": "#D4B896", "roughness": 0.65, "metalness": 0.0},
            "study": {"base_color": "#C8B090", "roughness": 0.65, "metalness": 0.0},
            "balcony": {"base_color": "#C0B8A8", "roughness": 0.4, "metalness": 0.0},
        }
    }));
    m.insert("nordic".to_string(), serde_json::json!({
        "wall": {"base_color": "#EBEBEB", "roughness": 0.88, "metalness": 0.0},
        "ceiling": {"base_color": "#F8F8F8", "roughness": 0.92, "metalness": 0.0},
        "door": {"base_color": "#A89070", "roughness": 0.5, "metalness": 0.0},
        "window": {"base_color": "#D0E4F0", "roughness": 0.08, "metalness": 0.0},
        "floor": {
            "living_room": {"base_color": "#C9B896", "roughness": 0.6, "metalness": 0.0},
            "bedroom": {"base_color": "#D0C0A0", "roughness": 0.65, "metalness": 0.0},
            "kitchen": {"base_color": "#D8D0C8", "roughness": 0.45, "metalness": 0.0},
            "bathroom": {"base_color": "#E0E0E0", "roughness": 0.3, "metalness": 0.0},
            "dining_room": {"base_color": "#C9B896", "roughness": 0.6, "metalness": 0.0},
            "corridor": {"base_color": "#C9B896", "roughness": 0.6, "metalness": 0.0},
            "study": {"base_color": "#B8A888", "roughness": 0.6, "metalness": 0.0},
            "balcony": {"base_color": "#B0A898", "roughness": 0.4, "metalness": 0.0},
        }
    }));
    m
}
