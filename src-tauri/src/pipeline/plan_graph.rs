use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanGraphJSON {
    pub wall_segments: Vec<WallSegment>,
    pub faces: Vec<Face>,
    pub labels: Vec<RoomLabel>,
    pub doors: Vec<DoorCandidate>,
    pub windows: Vec<WindowCandidate>,
    pub scale_candidates: Vec<ScaleCandidate>,
    pub alignment_scores: Option<AlignmentScores>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallSegment {
    pub id: String,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub thickness_px: f64,
    pub source: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Face {
    pub id: String,
    pub polygon: Vec<[f64; 2]>,
    pub area_px: f64,
    pub label_ref: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomLabel {
    pub id: String,
    pub room_type: String,
    pub name: String,
    pub centroid: [f64; 2],
    pub confidence: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoorCandidate {
    pub id: String,
    pub position: [f64; 2],
    pub width_meters: f64,
    pub connected_rooms: Vec<String>,
    pub swing_direction: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowCandidate {
    pub id: String,
    pub position: [f64; 2],
    pub width_meters: f64,
    pub wall_side: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScaleCandidate {
    pub meters_per_pixel: f64,
    pub source_text: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlignmentScores {
    pub wall_iou: f64,
    pub wall_precision: f64,
    pub wall_recall: f64,
    pub room_iou: f64,
    pub overall: f64,
}

/// Build PlanGraphJSON by merging CV wall graph with VLM semantic data.
pub fn build_plan_graph(
    wall_graph: &crate::pipeline::wall_graph::WallGraphResult,
    vlm_response: &serde_json::Value,
    _image_width: u32,
    _image_height: u32,
) -> PlanGraphJSON {
    // Convert CV wall segments to PlanGraph wall segments
    let wall_segments: Vec<WallSegment> = wall_graph
        .segments
        .iter()
        .map(|s| WallSegment {
            id: s.id.clone(),
            start: s.start,
            end: s.end,
            thickness_px: 3.0,
            source: "cv_mask".into(),
            confidence: s.confidence,
        })
        .collect();

    // Extract VLM room labels (supports both legacy polygon format and hybrid centroid format)
    let mut labels: Vec<RoomLabel> = vlm_response
        .get("detected_rooms")
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![])
        .iter()
        .enumerate()
        .filter_map(|(i, room)| {
            let room_type = room.get("type")?.as_str()?;
            let name = room.get("name").and_then(|v| v.as_str()).unwrap_or(room_type);
            let centroid = room
                .get("centroid")
                .and_then(|v| v.as_array())
                .and_then(|arr| {
                    let x = arr.get(0).and_then(|v| v.as_f64())?;
                    let y = arr.get(1).and_then(|v| v.as_f64())?;
                    Some([x, y])
                })
                .or_else(|| {
                    room.get("polygon")
                        .and_then(|v| v.as_array())
                        .and_then(|poly| compute_centroid(poly))
                })?;
            let conf = room.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.7);
            Some(RoomLabel {
                id: format!("label_{}", i + 1),
                room_type: room_type.to_string(),
                name: name.to_string(),
                centroid,
                confidence: conf,
                source: "vlm".into(),
            })
        })
        .collect();

    // Build faces from VLM room polygons (preferred) or generate from centroids
    let mut faces: Vec<Face> = vlm_response
        .get("detected_rooms")
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![])
        .iter()
        .enumerate()
        .filter_map(|(i, room)| {
            let polygon_arr = room.get("polygon").and_then(|v| v.as_array())?;
            let polygon: Vec<[f64; 2]> = polygon_arr
                .iter()
                .filter_map(|p| {
                    let x = p.get(0).and_then(|v| v.as_f64())?;
                    let y = p.get(1).and_then(|v| v.as_f64())?;
                    Some([x, y])
                })
                .collect();
            if polygon.len() < 3 {
                return None;
            }
            let area = compute_polygon_area(&polygon);
            let label_id = format!("label_{}", i + 1);
            Some(Face {
                id: format!("face_{}", i + 1),
                polygon,
                area_px: area,
                label_ref: Some(label_id),
                source: "vlm".into(),
            })
        })
        .collect();

    // If no faces from VLM polygons but we have labels with centroids,
    // generate per-room faces from wall bounding box subdivision
    if faces.is_empty() && !labels.is_empty() && !wall_segments.is_empty() {
        log::info!(
            "No VLM polygons, generating per-room faces from {} centroids",
            labels.len()
        );
        let faces_from_centroids =
            generate_faces_from_centroids(&labels, &wall_segments);
        faces.extend(faces_from_centroids);
    }

    // If still no faces, generate a single fallback face from wall bounding box
    if faces.is_empty() && !wall_segments.is_empty() {
        log::warn!("No room faces available, generating fallback from wall bounding box");
        let (min_x, min_y, max_x, max_y) = wall_bbox(&wall_segments);
        let margin = 20.0;
        let poly = vec![
            [min_x + margin, min_y + margin],
            [max_x - margin, min_y + margin],
            [max_x - margin, max_y - margin],
            [min_x + margin, max_y - margin],
            [min_x + margin, min_y + margin],
        ];
        let area = compute_polygon_area(&poly);
        if area > 100.0 {
            if labels.is_empty() {
                labels.push(RoomLabel {
                    id: "label_1".into(),
                    room_type: "living_room".into(),
                    name: "Living Room".into(),
                    centroid: [(min_x + max_x) / 2.0, (min_y + max_y) / 2.0],
                    confidence: 0.5,
                    source: "cv_bbox".into(),
                });
            }
            faces.push(Face {
                id: "face_1".into(),
                polygon: poly,
                area_px: area,
                label_ref: Some(labels[0].id.clone()),
                source: "cv_bbox".into(),
            });
        }
    }

    // Extract doors
    let doors: Vec<DoorCandidate> = vlm_response
        .get("detected_doors")
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![])
        .iter()
        .enumerate()
        .filter_map(|(i, door)| {
            let pos = door.get("position").and_then(|v| v.as_array())?;
            let px = pos.get(0).and_then(|v| v.as_f64())?;
            let py = pos.get(1).and_then(|v| v.as_f64())?;
            let width = door.get("width_meters").and_then(|v| v.as_f64()).unwrap_or(0.9);
            let swing = door.get("swing_direction").and_then(|v| v.as_str()).unwrap_or("left_inward");
            let connected: Vec<String> = door
                .get("connected_rooms")
                .and_then(|v| v.as_array())
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|r| r.as_str().map(|s| s.to_string()))
                .collect();
            let conf = door.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.7);
            Some(DoorCandidate {
                id: format!("door_{}", i + 1),
                position: [px, py],
                width_meters: width,
                connected_rooms: connected,
                swing_direction: swing.to_string(),
                confidence: conf,
            })
        })
        .collect();

    // Extract windows
    let windows: Vec<WindowCandidate> = vlm_response
        .get("detected_windows")
        .and_then(|v| v.as_array())
        .unwrap_or(&vec![])
        .iter()
        .enumerate()
        .filter_map(|(i, win)| {
            let pos = win.get("position").and_then(|v| v.as_array())?;
            let px = pos.get(0).and_then(|v| v.as_f64())?;
            let py = pos.get(1).and_then(|v| v.as_f64())?;
            let width = win.get("width_meters").and_then(|v| v.as_f64()).unwrap_or(1.2);
            let side = win.get("wall_side").and_then(|v| v.as_str()).unwrap_or("north");
            let conf = win.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.7);
            Some(WindowCandidate {
                id: format!("window_{}", i + 1),
                position: [px, py],
                width_meters: width,
                wall_side: side.to_string(),
                confidence: conf,
            })
        })
        .collect();

    // Extract scale
    let scale_candidates = extract_scale_candidates(vlm_response);

    let source = if wall_graph.segments.len() >= 3 {
        "hybrid_cv_vlm".to_string()
    } else {
        "vlm_only".to_string()
    };

    log::info!(
        "PlanGraph: {} wall segments, {} faces, {} labels, {} doors, {} windows (source: {})",
        wall_segments.len(),
        faces.len(),
        labels.len(),
        doors.len(),
        windows.len(),
        source,
    );

    PlanGraphJSON {
        wall_segments,
        faces,
        labels,
        doors,
        windows,
        scale_candidates,
        alignment_scores: None,
        source,
    }
}

/// Generate per-room faces by subdividing the wall bounding box around VLM centroids.
/// Each centroid gets a rectangular face bounded by midpoints to neighboring centroids.
fn generate_faces_from_centroids(
    labels: &[RoomLabel],
    wall_segments: &[WallSegment],
) -> Vec<Face> {
    if labels.is_empty() {
        return Vec::new();
    }

    let (min_x, min_y, max_x, max_y) = wall_bbox(wall_segments);
    let margin = 20.0;
    let bx0 = min_x + margin;
    let by0 = min_y + margin;
    let bx1 = max_x - margin;
    let by1 = max_y - margin;

    // Collect sorted X and Y coordinates of clamped centroids
    let mut xs: Vec<f64> = labels.iter().map(|l| l.centroid[0].max(bx0).min(bx1)).collect();
    let mut ys: Vec<f64> = labels.iter().map(|l| l.centroid[1].max(by0).min(by1)).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    xs.dedup();
    ys.dedup();

    let mut faces = Vec::new();

    for (i, label) in labels.iter().enumerate() {
        // Clamp centroid to wall bounding box (VLM centroids may be outside walls)
        let cx = label.centroid[0].max(bx0).min(bx1);
        let cy = label.centroid[1].max(by0).min(by1);

        // Find X bounds: midpoints to adjacent centroids
        let face_x0 = if cx <= xs[0] {
            bx0
        } else {
            let left = xs.iter().filter(|&&x| x < cx).copied().fold(f64::NEG_INFINITY, f64::max);
            (left + cx) / 2.0
        };
        let face_x1 = if cx >= xs[xs.len() - 1] {
            bx1
        } else {
            let right = xs.iter().filter(|&&x| x > cx).copied().fold(f64::INFINITY, f64::min);
            (cx + right) / 2.0
        };

        // Find Y bounds: midpoints to adjacent centroids
        let face_y0 = if cy <= ys[0] {
            by0
        } else {
            let top = ys.iter().filter(|&&y| y < cy).copied().fold(f64::NEG_INFINITY, f64::max);
            (top + cy) / 2.0
        };
        let face_y1 = if cy >= ys[ys.len() - 1] {
            by1
        } else {
            let bottom = ys.iter().filter(|&&y| y > cy).copied().fold(f64::INFINITY, f64::min);
            (cy + bottom) / 2.0
        };

        // Clamp to bounding box
        let fx0 = face_x0.max(bx0).min(bx1);
        let fx1 = face_x1.max(bx0).min(bx1);
        let fy0 = face_y0.max(by0).min(by1);
        let fy1 = face_y1.max(by0).min(by1);

        if (fx1 - fx0) < 20.0 || (fy1 - fy0) < 20.0 {
            continue; // Skip degenerate faces
        }

        let poly = vec![
            [fx0, fy0],
            [fx1, fy0],
            [fx1, fy1],
            [fx0, fy1],
            [fx0, fy0],
        ];
        let area = compute_polygon_area(&poly);

        faces.push(Face {
            id: format!("face_{}", i + 1),
            polygon: poly,
            area_px: area,
            label_ref: Some(label.id.clone()),
            source: "centroid_subdivision".into(),
        });
    }

    faces
}

/// Compute bounding box of all wall segments.
fn wall_bbox(wall_segments: &[WallSegment]) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for seg in wall_segments {
        min_x = min_x.min(seg.start[0]).min(seg.end[0]);
        min_y = min_y.min(seg.start[1]).min(seg.end[1]);
        max_x = max_x.max(seg.start[0]).max(seg.end[0]);
        max_y = max_y.max(seg.start[1]).max(seg.end[1]);
    }
    (min_x, min_y, max_x, max_y)
}

fn compute_centroid(polygon: &Vec<serde_json::Value>) -> Option<[f64; 2]> {
    let mut sx = 0.0;
    let mut sy = 0.0;
    let mut n = 0;
    for p in polygon {
        if let (Some(x), Some(y)) = (p.get(0).and_then(|v| v.as_f64()), p.get(1).and_then(|v| v.as_f64())) {
            sx += x;
            sy += y;
            n += 1;
        }
    }
    if n == 0 {
        return None;
    }
    Some([sx / n as f64, sy / n as f64])
}

fn compute_polygon_area(polygon: &[[f64; 2]]) -> f64 {
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

fn extract_scale_candidates(vlm_response: &serde_json::Value) -> Vec<ScaleCandidate> {
    let mut candidates = Vec::new();

    if let Some(scale_info) = vlm_response.get("scale_info") {
        let detected = scale_info.get("detected").and_then(|v| v.as_bool()).unwrap_or(false);
        let mpp = scale_info.get("meters_per_pixel").and_then(|v| v.as_f64());
        if let Some(mpp) = mpp {
            candidates.push(ScaleCandidate {
                meters_per_pixel: mpp,
                source_text: if detected { "vlm_scale_markers" } else { "vlm_default" }.into(),
                confidence: if detected { 0.8 } else { 0.4 },
            });
        }
    }

    if let Some(overall) = vlm_response.get("overall_dimensions") {
        if let (Some(wp), Some(wm)) = (
            overall.get("width_pixels").and_then(|v| v.as_f64()),
            overall.get("width_meters").and_then(|v| v.as_f64()),
        ) {
            if wp > 0.0 && wm > 0.0 {
                candidates.push(ScaleCandidate {
                    meters_per_pixel: wm / wp,
                    source_text: "vlm_overall_dimensions".into(),
                    confidence: 0.6,
                });
            }
        }
    }

    candidates
}
