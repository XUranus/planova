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
    let mut scale_candidates = extract_scale_candidates(vlm_response, _image_width, _image_height);

    // CV fallback: assume typical residential floor plan longest wall extent ≈ 15-30m
    if !wall_segments.is_empty() {
        let mut max_extent: f64 = 0.0;
        for seg in &wall_segments {
            let dx = (seg.end[0] - seg.start[0]).abs();
            let dy = (seg.end[1] - seg.start[1]).abs();
            // Track individual segment lengths — longest wall line
            let len = (dx * dx + dy * dy).sqrt();
            if len > max_extent {
                max_extent = len;
            }
        }
        // Also check overall bounding box extent
        let (min_x, max_x, min_y, max_y) = wall_segments.iter().fold(
            (f64::MAX, f64::MIN, f64::MAX, f64::MIN),
            |(mnx, mxx, mny, mxy), s| {
                let sx = s.start[0].min(s.end[0]);
                let ex = s.start[0].max(s.end[0]);
                let sy = s.start[1].min(s.end[1]);
                let ey = s.start[1].max(s.end[1]);
                (mnx.min(sx), mxx.max(ex), mny.min(sy), mxy.max(ey))
            },
        );
        let bbox_extent = (max_x - min_x).max(max_y - min_y);
        let extent_px = max_extent.max(bbox_extent);

        if extent_px > 100.0 {
            let cv_mpp = 20.0 / extent_px;
            let total_w = _image_width as f64 * cv_mpp;
            let total_h = _image_height as f64 * cv_mpp;
            if total_w >= 1.0 && total_w <= 50.0 && total_h >= 1.0 && total_h <= 50.0 {
                log::info!(
                    "CV fallback scale: extent={:.0}px → mpp={:.5} → {:.1}×{:.1}m",
                    extent_px, cv_mpp, total_w, total_h
                );
                scale_candidates.push(ScaleCandidate {
                    meters_per_pixel: cv_mpp,
                    source_text: "cv_wall_extent".into(),
                    confidence: 0.35,
                });
            }
        }
    }

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

/// Generate per-room faces by clustering centroids by X and subdividing by Y within each cluster.
/// Rooms that share an X band are stacked vertically; rooms alone in a band span full height.
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

    // Cluster centroids by X coordinate (tolerance 50px)
    let x_tol = 50.0;
    let mut x_clusters: Vec<Vec<usize>> = Vec::new();
    let mut sorted_idx: Vec<usize> = (0..labels.len()).collect();
    sorted_idx.sort_by(|&a, &b| {
        labels[a].centroid[0].partial_cmp(&labels[b].centroid[0]).unwrap_or(std::cmp::Ordering::Equal)
    });

    for &i in &sorted_idx {
        let cx = labels[i].centroid[0];
        let mut placed = false;
        for cluster in &mut x_clusters {
            let cluster_cx: f64 = cluster.iter().map(|&j| labels[j].centroid[0]).sum::<f64>() / cluster.len() as f64;
            if (cx - cluster_cx).abs() < x_tol {
                cluster.push(i);
                placed = true;
                break;
            }
        }
        if !placed {
            x_clusters.push(vec![i]);
        }
    }

    // Sort clusters left to right
    x_clusters.sort_by(|a, b| {
        let ax: f64 = a.iter().map(|&i| labels[i].centroid[0]).sum::<f64>() / a.len() as f64;
        let bx: f64 = b.iter().map(|&i| labels[i].centroid[0]).sum::<f64>() / b.len() as f64;
        ax.partial_cmp(&bx).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Compute X boundaries between clusters (midpoints)
    let cluster_cx: Vec<f64> = x_clusters
        .iter()
        .map(|c| c.iter().map(|&i| labels[i].centroid[0]).sum::<f64>() / c.len() as f64)
        .collect();

    let mut faces = Vec::new();

    for (ci, cluster) in x_clusters.iter().enumerate() {
        let cx0 = if ci == 0 {
            bx0
        } else {
            (cluster_cx[ci - 1] + cluster_cx[ci]) / 2.0
        };
        let cx1 = if ci == x_clusters.len() - 1 {
            bx1
        } else {
            (cluster_cx[ci] + cluster_cx[ci + 1]) / 2.0
        };

        // Sort this cluster by Y
        let mut y_sorted = cluster.clone();
        y_sorted.sort_by(|&a, &b| {
            labels[a].centroid[1].partial_cmp(&labels[b].centroid[1]).unwrap_or(std::cmp::Ordering::Equal)
        });

        if y_sorted.len() == 1 {
            // Single room in this X band — spans full height
            let idx = y_sorted[0];
            let poly = vec![
                [cx0, by0], [cx1, by0], [cx1, by1], [cx0, by1], [cx0, by0],
            ];
            faces.push(Face {
                id: format!("face_{}", idx + 1),
                polygon: poly.clone(),
                area_px: compute_polygon_area(&poly),
                label_ref: Some(labels[idx].id.clone()),
                source: "centroid_subdivision".into(),
            });
        } else {
            // Multiple rooms — subdivide by Y midpoints
            for (j, &idx) in y_sorted.iter().enumerate() {
                let cy0 = if j == 0 {
                    by0
                } else {
                    (labels[y_sorted[j - 1]].centroid[1] + labels[idx].centroid[1]) / 2.0
                };
                let cy1 = if j == y_sorted.len() - 1 {
                    by1
                } else {
                    (labels[idx].centroid[1] + labels[y_sorted[j + 1]].centroid[1]) / 2.0
                };
                let poly = vec![
                    [cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1], [cx0, cy0],
                ];
                faces.push(Face {
                    id: format!("face_{}", idx + 1),
                    polygon: poly.clone(),
                    area_px: compute_polygon_area(&poly),
                    label_ref: Some(labels[idx].id.clone()),
                    source: "centroid_subdivision".into(),
                });
            }
        }
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

fn extract_scale_candidates(
    vlm_response: &serde_json::Value,
    image_width: u32,
    image_height: u32,
) -> Vec<ScaleCandidate> {
    let mut candidates = Vec::new();
    let img_w = image_width as f64;
    let img_h = image_height as f64;

    if let Some(scale_info) = vlm_response.get("scale_info") {
        let detected = scale_info.get("detected").and_then(|v| v.as_bool()).unwrap_or(false);
        let mpp = scale_info.get("meters_per_pixel").and_then(|v| v.as_f64());
        if let Some(mpp) = mpp {
            // Plausibility check: reject if model dimensions would exceed 50m or be < 1m
            let total_w = img_w * mpp;
            let total_h = img_h * mpp;
            let implausible = mpp <= 0.0 || total_w > 50.0 || total_h > 50.0 || total_w < 0.5 || total_h < 0.5;
            let confidence = if implausible {
                log::warn!(
                    "VLM scale implausible: mpp={:.5} → {:.1}×{:.1}m, downgrading confidence",
                    mpp, total_w, total_h
                );
                0.2
            } else if detected {
                0.8
            } else {
                0.4
            };
            candidates.push(ScaleCandidate {
                meters_per_pixel: mpp,
                source_text: if detected { "vlm_scale_markers" } else { "vlm_default" }.into(),
                confidence,
            });
        }
    }

    if let Some(overall) = vlm_response.get("overall_dimensions") {
        if let (Some(wp), Some(wm)) = (
            overall.get("width_pixels").and_then(|v| v.as_f64()),
            overall.get("width_meters").and_then(|v| v.as_f64()),
        ) {
            if wp > 0.0 && wm > 0.0 {
                let mpp = wm / wp;
                let total_w = img_w * mpp;
                let total_h = img_h * mpp;
                let confidence = if total_w > 50.0 || total_h > 50.0 || total_w < 0.5 || total_h < 0.5 {
                    0.2
                } else {
                    0.75
                };
                candidates.push(ScaleCandidate {
                    meters_per_pixel: mpp,
                    source_text: "vlm_overall_dimensions".into(),
                    confidence,
                });
            }
        }
    }

    candidates
}
