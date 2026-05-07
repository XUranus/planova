use serde_json::Value;

const SNAP_THRESHOLD: f64 = 0.05;
const ORTHO_THRESHOLD_DEG: f64 = 10.0;
const MIN_ROOM_AREA: f64 = 0.5;
const WALL_SNAP_THRESHOLD: f64 = 0.05;
const COLLINEAR_DIST_THRESHOLD: f64 = 0.1;
const COLLINEAR_ANGLE_THRESHOLD_DEG: f64 = 5.0;

pub fn repair_scene(scene: &mut Value) -> Vec<String> {
    let mut actions = Vec::new();

    repair_rooms(scene, &mut actions);
    repair_walls(scene, &mut actions);
    repair_openings(scene, &mut actions);

    actions
}

fn repair_rooms(scene: &mut Value, actions: &mut Vec<String>) {
    let Some(rooms) = scene.get_mut("rooms").and_then(|v| v.as_array_mut()) else {
        return;
    };

    let before = rooms.len();

    // Remove degenerate rooms
    rooms.retain(|room| {
        let area = room.get("area").and_then(|v| v.as_f64()).unwrap_or(0.0);
        area >= MIN_ROOM_AREA
    });
    let removed = before.saturating_sub(rooms.len());
    if removed > 0 {
        actions.push(format!("removed {} degenerate room(s) with area < {MIN_ROOM_AREA} m²", removed));
    }

    // Collect all polygon points for global snapping
    let mut all_points: Vec<[f64; 2]> = Vec::new();
    for room in rooms.iter() {
        if let Some(poly) = room.get("polygon").and_then(|v| v.as_array()) {
            for p in poly {
                if let (Some(x), Some(z)) = (p.get(0).and_then(|v| v.as_f64()), p.get(1).and_then(|v| v.as_f64())) {
                    all_points.push([x, z]);
                }
            }
        }
    }
    let snap_map = build_snap_map(&all_points, SNAP_THRESHOLD);

    let mut snap_count = 0;
    let mut close_count = 0;
    let mut ortho_count = 0;

    for room in rooms.iter_mut() {
        let Some(poly) = room.get_mut("polygon") else { continue };
        let Some(arr) = poly.as_array_mut() else { continue };

        // Apply global snap
        snap_count += snap_polygon_in_place(arr, &snap_map);

        // Orthogonalize near-orthogonal edges
        if orthogonalize_polygon(arr) {
            ortho_count += 1;
        }

        // Close polygon
        if close_polygon(arr) {
            close_count += 1;
        }

        // Recompute area after repairs
        let pts = extract_points(arr);
        let area = polygon_area(&pts);
        if let Some(a) = room.get_mut("area") {
            *a = serde_json::json!((area * 100.0).round() / 100.0);
        }
    }

    if snap_count > 0 {
        actions.push(format!("snapped {snap_count} polygon vertex/vertices to nearby points"));
    }
    if ortho_count > 0 {
        actions.push(format!("orthogonalized {ortho_count} room polygon(s)"));
    }
    if close_count > 0 {
        actions.push(format!("closed {close_count} unclosed polygon(s)"));
    }

    // Resolve room overlaps
    resolve_room_overlaps(rooms, actions);
}

fn repair_walls(scene: &mut Value, actions: &mut Vec<String>) {
    // Clone rooms data before mutable borrow of walls
    let rooms = scene.get("rooms").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let Some(walls) = scene.get_mut("walls").and_then(|v| v.as_array_mut()) else {
        return;
    };

    // Snap wall endpoints
    let mut all_endpoints: Vec<[f64; 2]> = Vec::new();
    for wall in walls.iter() {
        if let Some(start) = wall.get("start").and_then(|v| v.as_array()) {
            if let (Some(x), Some(z)) = (start.get(0).and_then(|v| v.as_f64()), start.get(1).and_then(|v| v.as_f64())) {
                all_endpoints.push([x, z]);
            }
        }
        if let Some(end) = wall.get("end").and_then(|v| v.as_array()) {
            if let (Some(x), Some(z)) = (end.get(0).and_then(|v| v.as_f64()), end.get(1).and_then(|v| v.as_f64())) {
                all_endpoints.push([x, z]);
            }
        }
    }
    let snap_map = build_snap_map(&all_endpoints, WALL_SNAP_THRESHOLD);

    let mut snap_count = 0;
    for wall in walls.iter_mut() {
        for key in &["start", "end"] {
            let Some(arr) = wall.get_mut(key).and_then(|v| v.as_array_mut()) else { continue };
            if snap_endpoint_in_place(arr, &snap_map) {
                snap_count += 1;
            }
        }
    }
    if snap_count > 0 {
        actions.push(format!("snapped {snap_count} wall endpoint(s)"));
    }

    // Merge collinear walls
    let before = walls.len();
    merge_collinear_walls(walls);
    let merged = before.saturating_sub(walls.len());
    if merged > 0 {
        actions.push(format!("merged {merged} collinear wall segment(s)"));
    }

    // Fix wall-room refs
    let mut fix_count = 0;
    for wall in walls.iter_mut() {
        if fix_wall_room_refs(wall, &rooms) {
            fix_count += 1;
        }
    }
    if fix_count > 0 {
        actions.push(format!("fixed room_refs for {fix_count} wall(s)"));
    }
}

fn repair_openings(scene: &mut Value, actions: &mut Vec<String>) {
    // Clone walls and global data before mutable borrow of openings
    let walls = scene.get("walls").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let global = scene.get("global").cloned().unwrap_or_default();
    let wall_thickness = global.get("wall_thickness").and_then(|v| v.as_f64()).unwrap_or(0.2);

    let Some(openings) = scene.get_mut("openings").and_then(|v| v.as_array_mut()) else {
        return;
    };

    let mut rebound = 0;
    for opening in openings.iter_mut() {
        let Some(pos) = opening.get("position").and_then(|v| v.as_array()) else { continue };
        let px = pos.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let pz = pos.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let point = [px, pz];

        let (nearest_id, dist) = find_nearest_wall_with_dist(&point, &walls);
        if nearest_id.is_empty() { continue; }

        let current_ref = opening.get("wall_ref").and_then(|v| v.as_str()).unwrap_or("");
        if current_ref != nearest_id && dist <= wall_thickness * 2.0 {
            if let Some(obj) = opening.as_object_mut() {
                obj.insert("wall_ref".to_string(), serde_json::json!(nearest_id));
                rebound += 1;
            }
        }
    }
    if rebound > 0 {
        actions.push(format!("rebound {rebound} opening(s) to closer wall"));
    }
}

// --- Helpers ---

fn build_snap_map(points: &[[f64; 2]], threshold: f64) -> std::collections::HashMap<(i64, i64), [f64; 2]> {
    let grid = (threshold * 1000.0) as i64;
    let mut cell_points: std::collections::HashMap<(i64, i64), Vec<[f64; 2]>> = std::collections::HashMap::new();

    for &p in points {
        let cell = ((p[0] * 1000.0) as i64 / grid, (p[1] * 1000.0) as i64 / grid);
        cell_points.entry(cell).or_default().push(p);
    }

    let mut snap_map = std::collections::HashMap::new();
    for (_cell, group) in &cell_points {
        if group.len() < 2 { continue; }
        let cx = group.iter().map(|p| p[0]).sum::<f64>() / group.len() as f64;
        let cz = group.iter().map(|p| p[1]).sum::<f64>() / group.len() as f64;
        let snapped = [(cx * 1000.0).round() / 1000.0, (cz * 1000.0).round() / 1000.0];
        for &p in group {
            let dist = ((p[0] - snapped[0]).powi(2) + (p[1] - snapped[1]).powi(2)).sqrt();
            if dist < threshold {
                let key = ((p[0] * 1000.0) as i64, (p[1] * 1000.0) as i64);
                snap_map.insert(key, snapped);
            }
        }
    }

    snap_map
}

fn snap_polygon_in_place(arr: &mut Vec<Value>, snap_map: &std::collections::HashMap<(i64, i64), [f64; 2]>) -> usize {
    let mut count = 0;
    for p in arr.iter_mut() {
        let Some(pt) = p.as_array_mut() else { continue };
        if pt.len() < 2 { continue; }
        let x = pt[0].as_f64().unwrap_or(0.0);
        let z = pt[1].as_f64().unwrap_or(0.0);
        let key = ((x * 1000.0) as i64, (z * 1000.0) as i64);
        if let Some(&snapped) = snap_map.get(&key) {
            pt[0] = serde_json::json!(snapped[0]);
            pt[1] = serde_json::json!(snapped[1]);
            count += 1;
        }
    }
    count
}

fn snap_endpoint_in_place(arr: &mut Vec<Value>, snap_map: &std::collections::HashMap<(i64, i64), [f64; 2]>) -> bool {
    if arr.len() < 2 { return false; }
    let x = arr[0].as_f64().unwrap_or(0.0);
    let z = arr[1].as_f64().unwrap_or(0.0);
    let key = ((x * 1000.0) as i64, (z * 1000.0) as i64);
    if let Some(&snapped) = snap_map.get(&key) {
        arr[0] = serde_json::json!(snapped[0]);
        arr[1] = serde_json::json!(snapped[1]);
        return true;
    }
    false
}

fn orthogonalize_polygon(arr: &mut Vec<Value>) -> bool {
    let pts = extract_points(arr);
    if pts.len() < 3 { return false; }

    let thresh = ORTHO_THRESHOLD_DEG.to_radians();
    let mut needs_ortho = false;

    for i in 0..pts.len() {
        let j = (i + 1) % pts.len();
        let dx = pts[j][0] - pts[i][0];
        let dz = pts[j][1] - pts[i][1];
        let angle = dz.atan2(dx).abs();
        let angle_from_h = angle.min((std::f64::consts::PI - angle).abs());
        let angle_from_v = (angle - std::f64::consts::PI / 2.0).abs();
        if angle_from_h > thresh && angle_from_v > thresh {
            needs_ortho = true;
            break;
        }
    }

    if !needs_ortho { return false; }

    // Snap each edge to nearest horizontal or vertical
    let mut new_pts = pts.clone();
    for i in 0..pts.len() {
        let j = (i + 1) % pts.len();
        let dx = new_pts[j][0] - new_pts[i][0];
        let dz = new_pts[j][1] - new_pts[i][1];
        if dx.abs() > dz.abs() {
            // Snap to horizontal: keep x, set z to start's z
            new_pts[j][1] = new_pts[i][1];
        } else {
            // Snap to vertical: keep z, set x to start's x
            new_pts[j][0] = new_pts[i][0];
        }
    }

    for (i, p) in arr.iter_mut().enumerate() {
        if i >= new_pts.len() { break; }
        let Some(pt) = p.as_array_mut() else { continue };
        if pt.len() < 2 { continue; }
        pt[0] = serde_json::json!((new_pts[i][0] * 1000.0).round() / 1000.0);
        pt[1] = serde_json::json!((new_pts[i][1] * 1000.0).round() / 1000.0);
    }

    true
}

fn close_polygon(arr: &mut Vec<Value>) -> bool {
    if arr.len() < 3 { return false; }

    let first = extract_point(&arr[0]);
    let last = extract_point(&arr[arr.len() - 1]);
    let dist = ((first[0] - last[0]).powi(2) + (first[1] - last[1]).powi(2)).sqrt();

    if dist > 0.001 {
        arr.push(arr[0].clone());
        return true;
    }
    false
}

fn resolve_room_overlaps(rooms: &mut Vec<Value>, actions: &mut Vec<String>) {
    // Simple overlap detection: check if room centroids are inside another room
    // Full polygon intersection is complex, so we use a simpler heuristic:
    // if >50% of one room's vertices are inside another room, flag it
    let room_polys: Vec<Vec<[f64; 2]>> = rooms
        .iter()
        .filter_map(|r| r.get("polygon").and_then(|v| v.as_array()))
        .map(|arr| extract_points(arr))
        .collect();

    let mut overlap_pairs = Vec::new();
    for i in 0..room_polys.len() {
        for j in (i + 1)..room_polys.len() {
            let inside_count = room_polys[j].iter().filter(|p| point_in_polygon(p, &room_polys[i])).count();
            let total = room_polys[j].len();
            if total > 0 && inside_count as f64 / total as f64 > 0.5 {
                overlap_pairs.push((i, j));
            }
        }
    }

    if !overlap_pairs.is_empty() {
        actions.push(format!("detected {} room overlap(s) — may need manual review", overlap_pairs.len()));
    }
}

fn fix_wall_room_refs(wall: &mut Value, rooms: &[Value]) -> bool {
    let Some(start) = wall.get("start").and_then(|v| v.as_array()) else { return false };
    let Some(end) = wall.get("end").and_then(|v| v.as_array()) else { return false };
    let sx = start.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let sz = start.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let ex = end.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let ez = end.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);

    let wall_mid = [(sx + ex) / 2.0, (sz + ez) / 2.0];
    let wall_len = ((ex - sx).powi(2) + (ez - sz).powi(2)).sqrt();
    if wall_len < 0.01 { return false; }

    // Find rooms whose polygon has an edge close to this wall
    let mut matching_rooms = Vec::new();
    for room in rooms {
        let room_id = room.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let Some(poly) = room.get("polygon").and_then(|v| v.as_array()) else { continue };
        let pts = extract_points(poly);

        for i in 0..pts.len() {
            let j = (i + 1) % pts.len();
            let edge_mid = [(pts[i][0] + pts[j][0]) / 2.0, (pts[i][1] + pts[j][1]) / 2.0];
            let edge_len = ((pts[j][0] - pts[i][0]).powi(2) + (pts[j][1] - pts[i][1]).powi(2)).sqrt();

            // Check if wall and edge are similar (same midpoint area, similar length)
            let mid_dist = ((wall_mid[0] - edge_mid[0]).powi(2) + (wall_mid[1] - edge_mid[1]).powi(2)).sqrt();
            let len_ratio = if edge_len > 0.01 { (wall_len / edge_len).min(edge_len / wall_len) } else { 0.0 };

            if mid_dist < 0.3 && len_ratio > 0.5 {
                matching_rooms.push(room_id.to_string());
                break;
            }
        }
    }

    if matching_rooms.is_empty() { return false; }

    let current_refs: Vec<String> = wall
        .get("room_refs")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    if current_refs != matching_rooms {
        if let Some(obj) = wall.as_object_mut() {
            obj.insert("room_refs".to_string(), serde_json::json!(matching_rooms));
            return true;
        }
    }
    false
}

fn merge_collinear_walls(walls: &mut Vec<Value>) {
    let thresh_rad = COLLINEAR_ANGLE_THRESHOLD_DEG.to_radians();
    let mut to_remove = std::collections::HashSet::new();

    for i in 0..walls.len() {
        if to_remove.contains(&i) { continue; }
        let Some(si) = walls[i].get("start").and_then(|v| v.as_array()) else { continue };
        let Some(ei) = walls[i].get("end").and_then(|v| v.as_array()) else { continue };
        let s1 = extract_point_from_arr(si);
        let e1 = extract_point_from_arr(ei);
        let dx1 = e1[0] - s1[0];
        let dy1 = e1[1] - s1[1];
        let len1 = (dx1 * dx1 + dy1 * dy1).sqrt();
        if len1 < 0.01 { continue; }
        let angle1 = dy1.atan2(dx1);

        for j in (i + 1)..walls.len() {
            if to_remove.contains(&j) { continue; }
            let Some(sj) = walls[j].get("start").and_then(|v| v.as_array()) else { continue };
            let Some(ej) = walls[j].get("end").and_then(|v| v.as_array()) else { continue };
            let s2 = extract_point_from_arr(sj);
            let e2 = extract_point_from_arr(ej);
            let dx2 = e2[0] - s2[0];
            let dy2 = e2[1] - s2[1];
            let len2 = (dx2 * dx2 + dy2 * dy2).sqrt();
            if len2 < 0.01 { continue; }
            let angle2 = dy2.atan2(dx2);

            // Check angle similarity
            let angle_diff = (angle1 - angle2).abs();
            let angle_diff = angle_diff.min(std::f64::consts::PI - angle_diff);
            if angle_diff > thresh_rad { continue; }

            // Check if they are collinear (one endpoint is close to the other's line)
            let dist = point_to_segment_distance_arr(&s2, &s1, &e1);
            if dist > COLLINEAR_DIST_THRESHOLD { continue; }

            // Merge: extend wall i to cover wall j, mark j for removal
            // Find the two extreme points along the direction
            let mut all_pts = vec![s1, e1, s2, e2];
            all_pts.sort_by(|a, b| {
                let proj_a = a[0] * dx1 + a[1] * dy1;
                let proj_b = b[0] * dx1 + b[1] * dy1;
                proj_a.partial_cmp(&proj_b).unwrap()
            });

            let new_start = all_pts[0];
            let new_end = all_pts[all_pts.len() - 1];

            if let Some(obj) = walls[i].as_object_mut() {
                obj.insert("start".to_string(), serde_json::json!([new_start[0], new_start[1]]));
                obj.insert("end".to_string(), serde_json::json!([new_end[0], new_end[1]]));
            }
            to_remove.insert(j);
        }
    }

    let mut idx = 0;
    walls.retain(|_| {
        let keep = !to_remove.contains(&idx);
        idx += 1;
        keep
    });
}

fn find_nearest_wall_with_dist(point: &[f64; 2], walls: &[Value]) -> (String, f64) {
    let mut min_dist = f64::INFINITY;
    let mut nearest_id = String::new();

    for wall in walls {
        let start = wall.get("start").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let end = wall.get("end").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let a = extract_point_from_arr(&start);
        let b = extract_point_from_arr(&end);
        let dist = point_to_segment_distance_arr(point, &a, &b);
        if dist < min_dist {
            min_dist = dist;
            nearest_id = wall.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        }
    }

    (nearest_id, min_dist)
}

fn point_to_segment_distance_arr(p: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if dx == 0.0 && dy == 0.0 {
        return ((p[0] - a[0]).powi(2) + (p[1] - a[1]).powi(2)).sqrt();
    }
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    let t = t.clamp(0.0, 1.0);
    let proj = [a[0] + t * dx, a[1] + t * dy];
    ((p[0] - proj[0]).powi(2) + (p[1] - proj[1]).powi(2)).sqrt()
}

fn point_in_polygon(point: &[f64; 2], polygon: &[[f64; 2]]) -> bool {
    let n = polygon.len();
    if n < 3 { return false; }
    let mut inside = false;
    let (px, pz) = (point[0], point[1]);
    let mut j = n - 1;
    for i in 0..n {
        let (xi, zi) = (polygon[i][0], polygon[i][1]);
        let (xj, zj) = (polygon[j][0], polygon[j][1]);
        if ((zi > pz) != (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

fn extract_points(arr: &[Value]) -> Vec<[f64; 2]> {
    arr.iter().map(|p| extract_point(p)).collect()
}

fn extract_point(v: &Value) -> [f64; 2] {
    let arr = v.as_array();
    match arr {
        Some(a) => [
            a.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
            a.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
        ],
        None => [0.0, 0.0],
    }
}

fn extract_point_from_arr(arr: &[Value]) -> [f64; 2] {
    [
        arr.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0),
        arr.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
    ]
}

fn polygon_area(polygon: &[[f64; 2]]) -> f64 {
    let n = polygon.len();
    if n < 3 { return 0.0; }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += polygon[i][0] * polygon[j][1];
        area -= polygon[j][0] * polygon[i][1];
    }
    area.abs() / 2.0
}
