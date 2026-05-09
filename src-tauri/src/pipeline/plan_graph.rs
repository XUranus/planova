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
    // try wall-based topology first, then fall back to centroid subdivision
    if faces.is_empty() && !labels.is_empty() && !wall_segments.is_empty() {
        // Try wall-based room generation (uses actual wall positions as dividers)
        let faces_from_walls =
            generate_faces_from_walls(&labels, &wall_segments, _image_width, _image_height);
        if !faces_from_walls.is_empty() {
            log::info!("Generated {} faces from wall grid topology", faces_from_walls.len());
            faces.extend(faces_from_walls);
        } else {
            log::info!(
                "Wall grid failed, falling back to centroid subdivision for {} labels",
                labels.len()
            );
            let faces_from_centroids =
                generate_faces_from_centroids(&labels, &wall_segments);
            faces.extend(faces_from_centroids);
        }
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
    let mut doors: Vec<DoorCandidate> = vlm_response
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
    let mut windows: Vec<WindowCandidate> = vlm_response
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
    snap_openings_to_walls(&mut doors, &mut windows, &wall_segments, &labels, 120.0);

    // Extract scale
    let mut scale_candidates = extract_scale_candidates(vlm_response, _image_width, _image_height, &wall_segments);

    // CV fallback: assume typical residential floor plan longest dimension ≈ 6-12m
    if !wall_segments.is_empty() {
        let mut max_extent: f64 = 0.0;
        for seg in &wall_segments {
            let dx = (seg.end[0] - seg.start[0]).abs();
            let dy = (seg.end[1] - seg.start[1]).abs();
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
            let cv_mpp = 8.0 / extent_px;
            let total_w = _image_width as f64 * cv_mpp;
            let total_h = _image_height as f64 * cv_mpp;
            if total_w >= 1.0 && total_w <= 20.0 && total_h >= 1.0 && total_h <= 20.0 {
                log::info!(
                    "CV fallback scale: extent={:.0}px → mpp={:.5} → {:.1}×{:.1}m",
                    extent_px, cv_mpp, total_w, total_h
                );
                scale_candidates.push(ScaleCandidate {
                    meters_per_pixel: cv_mpp,
                    source_text: "cv_wall_extent".into(),
                    confidence: 0.45,
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

/// Point-to-segment distance. Returns (distance, projected_point).
fn point_to_segment_dist(px: f64, py: f64, ax: f64, ay: f64, bx: f64, by: f64) -> (f64, [f64; 2]) {
    let dx = bx - ax;
    let dy = by - ay;
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-10 {
        let d = ((px - ax).powi(2) + (py - ay).powi(2)).sqrt();
        return (d, [ax, ay]);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / len_sq;
    let t = t.max(0.0).min(1.0);
    let proj_x = ax + t * dx;
    let proj_y = ay + t * dy;
    let d = ((px - proj_x).powi(2) + (py - proj_y).powi(2)).sqrt();
    (d, [proj_x, proj_y])
}

/// Snap doors and windows to nearest wall segments. Validates room references.
fn snap_openings_to_walls(
    doors: &mut Vec<DoorCandidate>,
    windows: &mut Vec<WindowCandidate>,
    wall_segments: &[WallSegment],
    labels: &[RoomLabel],
    max_snap_distance: f64,
) {
    // Build valid room name set from labels
    let valid_rooms: std::collections::HashSet<String> = labels.iter()
        .flat_map(|l| vec![l.room_type.clone(), l.name.clone()])
        .collect();

    // Snap doors
    for door in doors.iter_mut() {
        let (dist, proj) = find_nearest_wall_point(door.position[0], door.position[1], wall_segments);
        if dist <= max_snap_distance {
            door.position = proj;
            log::info!("Snapped door {} to wall (dist={:.1}px)", door.id, dist);
        } else {
            log::warn!("Door {} at [{:.0},{:.0}] is {:.0}px from nearest wall, downgrading confidence",
                door.id, door.position[0], door.position[1], dist);
            door.confidence = (door.confidence * 0.5).min(0.3);
        }
        // Filter invalid room references
        door.connected_rooms.retain(|r| valid_rooms.contains(r));
    }

    // Snap windows
    for win in windows.iter_mut() {
        let (dist, proj) = find_nearest_wall_point(win.position[0], win.position[1], wall_segments);
        if dist <= max_snap_distance {
            win.position = proj;
            // Update wall_side based on nearest wall orientation
            if let Some(nearest) = find_nearest_wall_segment(win.position[0], win.position[1], wall_segments) {
                win.wall_side = if (nearest.end[1] - nearest.start[1]).abs() < (nearest.end[0] - nearest.start[0]).abs() {
                    let wall_y = (nearest.start[1] + nearest.end[1]) / 2.0;
                    if win.position[1] < wall_y { "south" } else { "north" }.to_string()
                } else {
                    let wall_x = (nearest.start[0] + nearest.end[0]) / 2.0;
                    if win.position[0] < wall_x { "east" } else { "west" }.to_string()
                };
            }
            log::info!("Snapped window {} to wall (dist={:.1}px)", win.id, dist);
        } else {
            log::warn!("Window {} at [{:.0},{:.0}] is {:.0}px from nearest wall, downgrading confidence",
                win.id, win.position[0], win.position[1], dist);
            win.confidence = (win.confidence * 0.5).min(0.3);
        }
    }
}

/// Find the nearest point on any wall segment to the given point.
fn find_nearest_wall_point(px: f64, py: f64, segments: &[WallSegment]) -> (f64, [f64; 2]) {
    let mut best_dist = f64::INFINITY;
    let mut best_proj = [px, py];
    for seg in segments {
        let (d, proj) = point_to_segment_dist(px, py, seg.start[0], seg.start[1], seg.end[0], seg.end[1]);
        if d < best_dist {
            best_dist = d;
            best_proj = proj;
        }
    }
    (best_dist, best_proj)
}

/// Find the nearest wall segment to the given point.
fn find_nearest_wall_segment<'a>(px: f64, py: f64, segments: &'a [WallSegment]) -> Option<&'a WallSegment> {
    let mut best_dist = f64::INFINITY;
    let mut best_seg = None;
    for seg in segments {
        let (d, _) = point_to_segment_dist(px, py, seg.start[0], seg.start[1], seg.end[0], seg.end[1]);
        if d < best_dist {
            best_dist = d;
            best_seg = Some(seg);
        }
    }
    best_seg
}

/// Generate room faces using actual wall positions as dividers.
/// Collects X coords from vertical walls, Y from horizontal walls to form a grid,
/// then assigns grid cells to nearest room centroid.
fn generate_faces_from_walls(
    labels: &[RoomLabel],
    wall_segments: &[WallSegment],
    image_width: u32,
    image_height: u32,
) -> Vec<Face> {
    if labels.is_empty() || wall_segments.is_empty() {
        return Vec::new();
    }

    let margin = 20.0;
    let bx0 = margin;
    let by0 = margin;
    let bx1 = image_width as f64 - margin;
    let by1 = image_height as f64 - margin;

    // Minimum segment length to use for grid generation (filters noise)
    const MIN_GRID_SEGMENT_LEN: f64 = 50.0;

    // Collect dominant X coordinates from vertical walls (skip short noise)
    let mut v_xs: Vec<f64> = wall_segments.iter()
        .filter(|s| {
            let is_vertical = (s.end[0] - s.start[0]).abs() < (s.end[1] - s.start[1]).abs();
            let len = ((s.end[0] - s.start[0]).powi(2) + (s.end[1] - s.start[1]).powi(2)).sqrt();
            is_vertical && len >= MIN_GRID_SEGMENT_LEN
        })
        .map(|s| (s.start[0] + s.end[0]) / 2.0)
        .collect();
    v_xs.push(bx0);
    v_xs.push(bx1);
    v_xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // Snap nearby X coordinates (within 20px)
    let mut snap_xs: Vec<f64> = Vec::new();
    for &x in &v_xs {
        if snap_xs.is_empty() || (x - *snap_xs.last().unwrap()) > 20.0 {
            snap_xs.push(x);
        } else {
            // Average with last
            let last = snap_xs.len() - 1;
            snap_xs[last] = (snap_xs[last] + x) / 2.0;
        }
    }

    // Collect dominant Y coordinates from horizontal walls (skip short noise)
    let mut h_ys: Vec<f64> = wall_segments.iter()
        .filter(|s| {
            let is_horizontal = (s.end[1] - s.start[1]).abs() < (s.end[0] - s.start[0]).abs();
            let len = ((s.end[0] - s.start[0]).powi(2) + (s.end[1] - s.start[1]).powi(2)).sqrt();
            is_horizontal && len >= MIN_GRID_SEGMENT_LEN
        })
        .map(|s| (s.start[1] + s.end[1]) / 2.0)
        .collect();
    h_ys.push(by0);
    h_ys.push(by1);
    h_ys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    // Snap nearby Y coordinates
    let mut snap_ys: Vec<f64> = Vec::new();
    for &y in &h_ys {
        if snap_ys.is_empty() || (y - *snap_ys.last().unwrap()) > 20.0 {
            snap_ys.push(y);
        } else {
            let last = snap_ys.len() - 1;
            snap_ys[last] = (snap_ys[last] + y) / 2.0;
        }
    }

    if snap_xs.len() < 2 || snap_ys.len() < 2 {
        log::warn!("Wall grid too sparse ({} x-lines, {} y-lines), falling back to centroid subdivision",
            snap_xs.len(), snap_ys.len());
        return Vec::new();
    }

    log::info!("Wall grid: {} X dividers, {} Y dividers → {} cells",
        snap_xs.len(), snap_ys.len(),
        (snap_xs.len() - 1) * (snap_ys.len() - 1));

    // Assign each cell to the nearest room centroid
    let nx = snap_xs.len() - 1;
    let ny = snap_ys.len() - 1;
    let mut cell_owner: Vec<Vec<usize>> = vec![vec![usize::MAX; ny]; nx];

    for ci in 0..nx {
        for cj in 0..ny {
            let cell_cx = (snap_xs[ci] + snap_xs[ci + 1]) / 2.0;
            let cell_cy = (snap_ys[cj] + snap_ys[cj + 1]) / 2.0;

            let mut best_dist = f64::INFINITY;
            let mut best_label = 0;
            for (li, label) in labels.iter().enumerate() {
                let d = ((cell_cx - label.centroid[0]).powi(2) + (cell_cy - label.centroid[1]).powi(2)).sqrt();
                if d < best_dist {
                    best_dist = d;
                    best_label = li;
                }
            }
            cell_owner[ci][cj] = best_label;
        }
    }

    // Fallback: if any label has no cells, reassign the cell nearest to its centroid
    let mut label_cell_count = vec![0usize; labels.len()];
    for col in &cell_owner {
        for &owner in col {
            if owner < labels.len() {
                label_cell_count[owner] += 1;
            }
        }
    }
    for (li, label) in labels.iter().enumerate() {
        if label_cell_count[li] > 0 {
            continue;
        }
        // Find the cell whose center is closest to this label's centroid
        let mut best_dist = f64::INFINITY;
        let mut best = (0usize, 0usize);
        for ci in 0..nx {
            for cj in 0..ny {
                let cell_cx = (snap_xs[ci] + snap_xs[ci + 1]) / 2.0;
                let cell_cy = (snap_ys[cj] + snap_ys[cj + 1]) / 2.0;
                let d = ((cell_cx - label.centroid[0]).powi(2) + (cell_cy - label.centroid[1]).powi(2)).sqrt();
                if d < best_dist {
                    best_dist = d;
                    best = (ci, cj);
                }
            }
        }
        cell_owner[best.0][best.1] = li;
    }

    // For each label, find all cells belonging to it and merge into one polygon
    let (wbx0, wby0, wbx1, wby1) = wall_bbox(wall_segments);
    let mut faces = Vec::new();
    for (li, label) in labels.iter().enumerate() {
        let mut min_cx = usize::MAX;
        let mut max_cx = 0usize;
        let mut min_cy = usize::MAX;
        let mut max_cy = 0usize;
        let mut found = false;

        for ci in 0..nx {
            for cj in 0..ny {
                if cell_owner[ci][cj] == li {
                    found = true;
                    min_cx = min_cx.min(ci);
                    max_cx = max_cx.max(ci);
                    min_cy = min_cy.min(cj);
                    max_cy = max_cy.max(cj);
                }
            }
        }

        if !found {
            continue;
        }

        let raw_poly = vec![
            [snap_xs[min_cx], snap_ys[min_cy]],
            [snap_xs[max_cx + 1], snap_ys[min_cy]],
            [snap_xs[max_cx + 1], snap_ys[max_cy + 1]],
            [snap_xs[min_cx], snap_ys[max_cy + 1]],
            [snap_xs[min_cx], snap_ys[min_cy]],
        ];
        let clipped = clip_polygon_to_rect(&raw_poly, wbx0, wby0, wbx1, wby1);
        let poly = clipped;
        let area = compute_polygon_area(&poly);

        if area > 100.0 {
            faces.push(Face {
                id: format!("face_{}", li + 1),
                polygon: poly,
                area_px: area,
                label_ref: Some(label.id.clone()),
                source: "wall_grid".into(),
            });
        }
    }

    if faces.len() == labels.len() {
        log::info!("Wall-based faces: generated {} room faces from wall grid", faces.len());
    } else {
        log::warn!("Wall-based faces: got {} faces for {} labels", faces.len(), labels.len());
    }

    faces
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

/// Clip a convex polygon to an axis-aligned rectangle.
fn clip_polygon_to_rect(polygon: &[[f64; 2]], rx0: f64, ry0: f64, rx1: f64, ry1: f64) -> Vec<[f64; 2]> {
    let mut output = polygon.to_vec();
    let edges: [(f64, f64, f64, f64); 4] = [
        (rx0, ry0, rx0, ry1), // left
        (rx1, ry0, rx1, ry1), // right
        (rx0, ry0, rx1, ry0), // bottom
        (rx0, ry1, rx1, ry1), // top
    ];
    for (ex0, ey0, ex1, ey1) in edges {
        if output.is_empty() { break; }
        let input = output.clone();
        output.clear();
        let n = input.len();
        for i in 0..n {
            let j = (i + 1) % n;
            let (px, py) = (input[i][0], input[i][1]);
            let (qx, qy) = (input[j][0], input[j][1]);
            let inside_p = if (ex1 - ex0).abs() < 1e-6 { // vertical edge
                if ex0 == rx0 { px >= ex0 } else { px <= ex0 }
            } else { // horizontal edge
                if ey0 == ry0 { py >= ey0 } else { py <= ey0 }
            };
            let inside_q = if (ex1 - ex0).abs() < 1e-6 {
                if ex0 == rx0 { qx >= ex0 } else { qx <= ex0 }
            } else {
                if ey0 == ry0 { qy >= ey0 } else { qy <= ey0 }
            };
            if inside_p { output.push(input[i]); }
            if inside_p != inside_q {
                let dx = qx - px;
                let dy = qy - py;
                let t = if (ex1 - ex0).abs() < 1e-6 {
                    if dx.abs() > 1e-10 { (ex0 - px) / dx } else { 0.5 }
                } else {
                    if dy.abs() > 1e-10 { (ey0 - py) / dy } else { 0.5 }
                };
                let t = t.clamp(0.0, 1.0);
                output.push([px + t * dx, py + t * dy]);
            }
        }
    }
    output
}
fn extract_scale_candidates(
    vlm_response: &serde_json::Value,
    image_width: u32,
    image_height: u32,
    wall_segments: &[WallSegment],
) -> Vec<ScaleCandidate> {
    let mut candidates = Vec::new();
    let img_w = image_width as f64;
    let img_h = image_height as f64;

    if let Some(scale_info) = vlm_response.get("scale_info") {
        let detected = scale_info.get("detected").and_then(|v| v.as_bool()).unwrap_or(false);
        let mpp = scale_info.get("meters_per_pixel").and_then(|v| v.as_f64());
        if let Some(mpp) = mpp {
            // Plausibility check: residential plans rarely exceed 20m per axis
            let total_w = img_w * mpp;
            let total_h = img_h * mpp;
            let implausible = mpp <= 0.0 || total_w > 20.0 || total_h > 20.0 || total_w < 0.5 || total_h < 0.5;
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
                let confidence = if total_w > 20.0 || total_h > 20.0 || total_w < 0.5 || total_h < 0.5 {
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

    // Cross-validate from dimension annotations.
    // Annotations measure room interior dimensions (wall centerline to centerline),
    // which matches the wall bounding box extent directly.
    if let Some(annotations) = vlm_response.get("dimension_annotations").and_then(|v| v.as_array()) {
        let (bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y) = wall_bbox(wall_segments);
        let bbox_w = bbox_max_x - bbox_min_x;
        let bbox_h = bbox_max_y - bbox_min_y;

        let mut annotation_mpps: Vec<f64> = Vec::new();
        for ann in annotations {
            if let (Some(text), Some(direction)) = (
                ann.get("text").and_then(|v| v.as_str()),
                ann.get("direction").and_then(|v| v.as_str()),
            ) {
                if let Ok(dim_mm) = text.parse::<f64>() {
                    let dim_m = dim_mm / 1000.0;
                    if dim_m > 0.5 && dim_m < 30.0 {
                        let extent_px = if direction == "horizontal" { bbox_w } else { bbox_h };
                        if extent_px > 50.0 {
                            let mpp = dim_m / extent_px;
                            let total_w = img_w * mpp;
                            let total_h = img_h * mpp;
                            log::info!("Annotation '{}' ({}): dim_m={:.3} extent_px={:.0} mpp={:.5}",
                                text, direction, dim_m, extent_px, mpp);
                            if total_w >= 1.0 && total_w <= 20.0 && total_h >= 1.0 && total_h <= 20.0 {
                                annotation_mpps.push(mpp);
                            }
                        }
                    }
                }
            }
        }
        if !annotation_mpps.is_empty() {
            // Use average mpp — the floor plan pixel aspect ratio differs from meter aspect ratio,
            // so a single annotation's mpp under/over-estimates the other dimension.
            let avg_mpp = annotation_mpps.iter().sum::<f64>() / annotation_mpps.len() as f64;
            log::info!(
                "Dimension annotation scale: avg_mpp={:.5} (from {} annotations) -> {:.1}x{:.1}m",
                avg_mpp, annotation_mpps.len(),
                img_w * avg_mpp, img_h * avg_mpp
            );
            candidates.push(ScaleCandidate {
                meters_per_pixel: avg_mpp,
                source_text: "dimension_annotations".into(),
                confidence: 0.9,
            });
        }
    }

    candidates
}
