use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::alignment::AlignmentScores;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub valid: bool,
    pub score: f64,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
    pub repair_actions: Vec<String>,
    pub parse_quality: ParseQuality,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_alignment: Option<ImageAlignmentReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationIssue {
    pub r#type: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseQuality {
    pub geometry_score: f64,
    pub semantic_score: f64,
    pub scale_score: f64,
    pub image_alignment_score: f64,
    pub needs_user_review: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAlignmentReport {
    pub wall_iou: f64,
    pub wall_precision: f64,
    pub wall_recall: f64,
    pub overall: f64,
}

pub fn validate_scene(scene: &Value, repair_actions: &[String]) -> ValidationReport {
    validate_scene_with_alignment(scene, repair_actions, None)
}

pub fn validate_scene_with_alignment(
    scene: &Value,
    repair_actions: &[String],
    alignment: Option<&AlignmentScores>,
) -> ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    validate_rooms(scene, &mut errors, &mut warnings);
    validate_walls(scene, &mut errors, &mut warnings);
    validate_openings(scene, &mut errors, &mut warnings);
    validate_scale(scene, &mut errors, &mut warnings);

    let error_count = errors.len() as f64;
    let warning_count = warnings.len() as f64;
    let score = (1.0 - error_count * 0.15 - warning_count * 0.05).max(0.0).min(1.0);

    let geometry_score = compute_geometry_score(scene);
    let semantic_score = compute_semantic_score(scene);
    let scale_score = compute_scale_score(scene);
    let image_alignment_score = alignment.map(|a| a.overall).unwrap_or(1.0);
    // Only require review for errors or poor alignment. Warnings alone (e.g., orphan walls
    // from centroid subdivision) don't warrant review if alignment is good.
    let needs_user_review = error_count > 0.0 || image_alignment_score < 0.75;

    let image_alignment = alignment.map(|a| ImageAlignmentReport {
        wall_iou: a.wall_iou,
        wall_precision: a.wall_precision,
        wall_recall: a.wall_recall,
        overall: a.overall,
    });

    ValidationReport {
        valid: errors.is_empty(),
        score: (score * 100.0).round() / 100.0,
        errors,
        warnings,
        repair_actions: repair_actions.to_vec(),
        parse_quality: ParseQuality {
            geometry_score: (geometry_score * 100.0).round() / 100.0,
            semantic_score: (semantic_score * 100.0).round() / 100.0,
            scale_score: (scale_score * 100.0).round() / 100.0,
            image_alignment_score: (image_alignment_score * 100.0).round() / 100.0,
            needs_user_review,
        },
        image_alignment,
    }
}

fn validate_rooms(scene: &Value, errors: &mut Vec<ValidationIssue>, warnings: &mut Vec<ValidationIssue>) {
    let Some(rooms) = scene.get("rooms").and_then(|v| v.as_array()) else { return };

    if rooms.is_empty() {
        errors.push(ValidationIssue {
            r#type: "no_rooms".into(),
            message: "No rooms detected in the floor plan".into(),
            ids: None,
        });
        return;
    }

    for room in rooms {
        let room_id = room.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
        let room_name = room.get("name").and_then(|v| v.as_str()).unwrap_or("?");
        let room_type = room.get("type").and_then(|v| v.as_str()).unwrap_or("?");

        let Some(poly) = room.get("polygon").and_then(|v| v.as_array()) else {
            errors.push(ValidationIssue {
                r#type: "missing_polygon".into(),
                message: format!("Room '{room_name}' has no polygon"),
                ids: Some(vec![room_id.clone()]),
            });
            continue;
        };

        let pts: Vec<[f64; 2]> = poly
            .iter()
            .filter_map(|p| {
                let x = p.get(0).and_then(|v| v.as_f64())?;
                let z = p.get(1).and_then(|v| v.as_f64())?;
                Some([x, z])
            })
            .collect();

        // Check minimum point count
        if pts.len() < 3 {
            errors.push(ValidationIssue {
                r#type: "degenerate_polygon".into(),
                message: format!("Room '{room_name}' has only {} points (need >= 3)", pts.len()),
                ids: Some(vec![room_id.clone()]),
            });
            continue;
        }

        // Check closure
        if pts.len() >= 2 {
            let first = pts[0];
            let last = pts[pts.len() - 1];
            let dist = ((first[0] - last[0]).powi(2) + (first[1] - last[1]).powi(2)).sqrt();
            if dist > 0.01 {
                errors.push(ValidationIssue {
                    r#type: "unclosed_polygon".into(),
                    message: format!("Room '{room_name}' polygon is not closed (gap: {dist:.3}m)"),
                    ids: Some(vec![room_id.clone()]),
                });
            }
        }

        // Check NaN/Inf
        let has_nan = pts.iter().any(|p| p[0].is_nan() || p[0].is_infinite() || p[1].is_nan() || p[1].is_infinite());
        if has_nan {
            errors.push(ValidationIssue {
                r#type: "invalid_coordinates".into(),
                message: format!("Room '{room_name}' has NaN or Inf coordinates"),
                ids: Some(vec![room_id.clone()]),
            });
        }

        // Check area
        let area = polygon_area(&pts);
        if area < 0.5 {
            errors.push(ValidationIssue {
                r#type: "tiny_room".into(),
                message: format!("Room '{room_name}' area is only {area:.2} m²"),
                ids: Some(vec![room_id.clone()]),
            });
        }

        // Check aspect ratio
        if pts.len() >= 3 {
            let xs: Vec<f64> = pts.iter().map(|p| p[0]).collect();
            let zs: Vec<f64> = pts.iter().map(|p| p[1]).collect();
            let w = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max) - xs.iter().copied().fold(f64::INFINITY, f64::min);
            let h = zs.iter().copied().fold(f64::NEG_INFINITY, f64::max) - zs.iter().copied().fold(f64::INFINITY, f64::min);
            if w > 0.01 && h > 0.01 {
                let ratio = (w / h).max(h / w);
                if ratio > 20.0 {
                    warnings.push(ValidationIssue {
                        r#type: "extreme_aspect_ratio".into(),
                        message: format!("Room '{room_name}' has extreme aspect ratio {ratio:.1}:1"),
                        ids: Some(vec![room_id.clone()]),
                    });
                }
            }
        }

        // Type-specific area warnings
        if room_type == "bedroom" && area < 3.0 && area >= 0.5 {
            warnings.push(ValidationIssue {
                r#type: "small_bedroom".into(),
                message: format!("Bedroom '{room_name}' is only {area:.1} m²"),
                ids: Some(vec![room_id.clone()]),
            });
        }
        if room_type == "bathroom" && area > 30.0 {
            warnings.push(ValidationIssue {
                r#type: "large_bathroom".into(),
                message: format!("Bathroom '{room_name}' is {area:.1} m² — unusually large"),
                ids: Some(vec![room_id.clone()]),
            });
        }

        // Check self-intersection
        if has_self_intersection(&pts) {
            warnings.push(ValidationIssue {
                r#type: "self_intersecting".into(),
                message: format!("Room '{room_name}' polygon may be self-intersecting"),
                ids: Some(vec![room_id]),
            });
        }
    }
}

fn validate_walls(scene: &Value, errors: &mut Vec<ValidationIssue>, warnings: &mut Vec<ValidationIssue>) {
    let Some(walls) = scene.get("walls").and_then(|v| v.as_array()) else { return };

    for wall in walls {
        let wall_id = wall.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
        let start = wall.get("start").and_then(|v| v.as_array());
        let end = wall.get("end").and_then(|v| v.as_array());

        let (Some(s), Some(e)) = (start, end) else {
            errors.push(ValidationIssue {
                r#type: "missing_wall_endpoint".into(),
                message: format!("Wall '{wall_id}' missing start or end"),
                ids: Some(vec![wall_id.clone()]),
            });
            continue;
        };

        let sx = s.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let sz = s.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ex = e.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let ez = e.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
        let len = ((ex - sx).powi(2) + (ez - sz).powi(2)).sqrt();

        if len < 0.05 {
            warnings.push(ValidationIssue {
                r#type: "tiny_wall".into(),
                message: format!("Wall '{wall_id}' is only {len:.3}m long"),
                ids: Some(vec![wall_id.clone()]),
            });
        }

        // Check room_refs
        let room_refs = wall.get("room_refs").and_then(|v| v.as_array());
        let is_orphan = match room_refs {
            None => true,
            Some(arr) => arr.is_empty(),
        };
        if is_orphan {
            warnings.push(ValidationIssue {
                r#type: "orphan_wall".into(),
                message: format!("Wall '{wall_id}' has no room_refs"),
                ids: Some(vec![wall_id.clone()]),
            });
        }
    }
}

fn validate_openings(scene: &Value, errors: &mut Vec<ValidationIssue>, warnings: &mut Vec<ValidationIssue>) {
    let Some(openings) = scene.get("openings").and_then(|v| v.as_array()) else { return };
    let walls: Vec<&Value> = scene.get("walls").and_then(|v| v.as_array()).map(|a| a.iter().collect()).unwrap_or_default();

    for opening in openings {
        let open_id = opening.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
        let open_type = opening.get("type").and_then(|v| v.as_str()).unwrap_or("?");
        let wall_ref = opening.get("wall_ref").and_then(|v| v.as_str()).unwrap_or("");
        let width = opening.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0);

        // Check wall_ref exists
        if wall_ref.is_empty() {
            errors.push(ValidationIssue {
                r#type: "unbound_opening".into(),
                message: format!("{open_type} '{open_id}' is not bound to any wall"),
                ids: Some(vec![open_id.clone()]),
            });
        } else if !walls.iter().any(|w| w.get("id").and_then(|v| v.as_str()) == Some(wall_ref)) {
            errors.push(ValidationIssue {
                r#type: "invalid_wall_ref".into(),
                message: format!("{open_type} '{open_id}' references non-existent wall '{wall_ref}'"),
                ids: Some(vec![open_id.clone()]),
            });
        }

        // Check width
        if open_type == "door" && (width < 0.5 || width > 2.0) {
            warnings.push(ValidationIssue {
                r#type: "unusual_door_width".into(),
                message: format!("Door '{open_id}' width is {width:.2}m (expected 0.6–1.5m)"),
                ids: Some(vec![open_id.clone()]),
            });
        }
        if open_type == "window" && (width < 0.2 || width > 4.0) {
            warnings.push(ValidationIssue {
                r#type: "unusual_window_width".into(),
                message: format!("Window '{open_id}' width is {width:.2}m (expected 0.3–3.0m)"),
                ids: Some(vec![open_id.clone()]),
            });
        }
    }
}

fn validate_scale(scene: &Value, _errors: &mut Vec<ValidationIssue>, warnings: &mut Vec<ValidationIssue>) {
    let rooms = scene.get("rooms").and_then(|v| v.as_array());

    // Check total extent
    if let Some(rooms) = rooms {
        let mut all_x = Vec::new();
        let mut all_z = Vec::new();
        for room in rooms {
            if let Some(poly) = room.get("polygon").and_then(|v| v.as_array()) {
                for p in poly {
                    if let (Some(x), Some(z)) = (p.get(0).and_then(|v| v.as_f64()), p.get(1).and_then(|v| v.as_f64())) {
                        all_x.push(x);
                        all_z.push(z);
                    }
                }
            }
        }
        if !all_x.is_empty() {
            let w = all_x.iter().copied().fold(f64::NEG_INFINITY, f64::max) - all_x.iter().copied().fold(f64::INFINITY, f64::min);
            let h = all_z.iter().copied().fold(f64::NEG_INFINITY, f64::max) - all_z.iter().copied().fold(f64::INFINITY, f64::min);
            let max_dim = w.max(h);
            if max_dim < 2.0 {
                warnings.push(ValidationIssue {
                    r#type: "tiny_floorplan".into(),
                    message: format!("Floor plan is only {max_dim:.1}m across — scale may be wrong"),
                    ids: None,
                });
            }
            if max_dim > 50.0 {
                warnings.push(ValidationIssue {
                    r#type: "huge_floorplan".into(),
                    message: format!("Floor plan is {max_dim:.1}m across — scale may be wrong"),
                    ids: None,
                });
            }
        }
    }
}

fn compute_geometry_score(scene: &Value) -> f64 {
    let rooms = scene.get("rooms").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let walls = scene.get("walls").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let openings = scene.get("openings").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);

    if rooms == 0 { return 0.0; }
    let mut score: f64 = 0.5; // base for having rooms
    if walls > 0 { score += 0.2; }
    if openings > 0 { score += 0.15; }
    if walls >= rooms { score += 0.15; }
    score.min(1.0)
}

fn compute_semantic_score(scene: &Value) -> f64 {
    let rooms = scene.get("rooms").and_then(|v| v.as_array());
    let Some(rooms) = rooms else { return 0.0; };
    if rooms.is_empty() { return 0.0; }

    let named = rooms.iter().filter(|r| {
        r.get("name").and_then(|v| v.as_str()).map(|s| !s.starts_with("Room ")).unwrap_or(false)
    }).count();
    let typed = rooms.iter().filter(|r| {
        r.get("type").and_then(|v| v.as_str()).map(|s| s != "living_room").unwrap_or(false)
    }).count();

    let name_ratio = named as f64 / rooms.len() as f64;
    let type_ratio = typed as f64 / rooms.len() as f64;
    (name_ratio * 0.5 + type_ratio * 0.5).min(1.0)
}

fn compute_scale_score(scene: &Value) -> f64 {
    let rooms = scene.get("rooms").and_then(|v| v.as_array());
    let Some(rooms) = rooms else { return 0.0; };

    let mut reasonable = 0;
    let mut total = 0;
    for room in rooms {
        let area = room.get("area").and_then(|v| v.as_f64()).unwrap_or(0.0);
        if area < 0.5 { continue; }
        total += 1;
        if area >= 1.0 && area <= 100.0 {
            reasonable += 1;
        }
    }
    if total == 0 { return 0.5; }
    reasonable as f64 / total as f64
}

fn has_self_intersection(pts: &[[f64; 2]]) -> bool {
    let n = pts.len();
    if n < 4 { return false; }
    for i in 0..n {
        let j = (i + 1) % n;
        for k in (i + 2)..n {
            let l = (k + 1) % n;
            if j == l { continue; }
            if segments_intersect(&pts[i], &pts[j], &pts[k], &pts[l]) {
                return true;
            }
        }
    }
    false
}

fn segments_intersect(a1: &[f64; 2], a2: &[f64; 2], b1: &[f64; 2], b2: &[f64; 2]) -> bool {
    fn cross(o: &[f64; 2], a: &[f64; 2], b: &[f64; 2]) -> f64 {
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    }
    let d1 = cross(b1, b2, a1);
    let d2 = cross(b1, b2, a2);
    let d3 = cross(a1, a2, b1);
    let d4 = cross(a1, a2, b2);
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
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
