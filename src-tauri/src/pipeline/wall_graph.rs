use image::GrayImage;
use imageproc::hough::{detect_lines, LineDetectionOptions, PolarLine};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallSegment {
    pub id: String,
    pub start: [f64; 2],
    pub end: [f64; 2],
    pub orientation: String, // "horizontal" or "vertical"
    pub source: String,      // "cv_hough"
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallGraphResult {
    pub segments: Vec<WallSegment>,
    pub junction_points: Vec<[f64; 2]>,
}

/// Zhang-Suen thinning: reduce a binary mask to 1px-wide skeleton lines.
fn skeletonize(mask: &GrayImage) -> GrayImage {
    let (w, h) = mask.dimensions();
    let size = (w * h) as usize;
    let mut data: Vec<u8> = mask.pixels().map(|p| if p[0] > 0 { 1 } else { 0 }).collect();
    let mut to_delete_1 = vec![false; size];
    let mut to_delete_2 = vec![false; size];

    loop {
        let mut changed = false;

        to_delete_1.fill(false);
        for y in 1..(h - 1) {
            for x in 1..(w - 1) {
                let idx = (y * w + x) as usize;
                if data[idx] == 0 { continue; }
                let p2 = data[((y - 1) * w + x) as usize];
                let p3 = data[((y - 1) * w + x + 1) as usize];
                let p4 = data[(y * w + x + 1) as usize];
                let p5 = data[((y + 1) * w + x + 1) as usize];
                let p6 = data[((y + 1) * w + x) as usize];
                let p7 = data[((y + 1) * w + x - 1) as usize];
                let p8 = data[(y * w + x - 1) as usize];
                let p9 = data[((y - 1) * w + x - 1) as usize];
                let neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];
                let bp: u8 = neighbors.iter().sum();
                if bp >= 2 && bp <= 6 {
                    let transitions = count_transitions(&neighbors);
                    if transitions == 1 && p2 * p4 * p6 == 0 && p4 * p6 * p8 == 0 {
                        to_delete_1[idx] = true;
                        changed = true;
                    }
                }
            }
        }
        for (i, &del) in to_delete_1.iter().enumerate() {
            if del { data[i] = 0; }
        }

        to_delete_2.fill(false);
        for y in 1..(h - 1) {
            for x in 1..(w - 1) {
                let idx = (y * w + x) as usize;
                if data[idx] == 0 { continue; }
                let p2 = data[((y - 1) * w + x) as usize];
                let p3 = data[((y - 1) * w + x + 1) as usize];
                let p4 = data[(y * w + x + 1) as usize];
                let p5 = data[((y + 1) * w + x + 1) as usize];
                let p6 = data[((y + 1) * w + x) as usize];
                let p7 = data[((y + 1) * w + x - 1) as usize];
                let p8 = data[(y * w + x - 1) as usize];
                let p9 = data[((y - 1) * w + x - 1) as usize];
                let neighbors = [p2, p3, p4, p5, p6, p7, p8, p9];
                let bp: u8 = neighbors.iter().sum();
                if bp >= 2 && bp <= 6 {
                    let transitions = count_transitions(&neighbors);
                    if transitions == 1 && p2 * p4 * p8 == 0 && p2 * p6 * p8 == 0 {
                        to_delete_2[idx] = true;
                        changed = true;
                    }
                }
            }
        }
        for (i, &del) in to_delete_2.iter().enumerate() {
            if del { data[i] = 0; }
        }

        if !changed { break; }
    }

    let mut result = mask.clone();
    for (i, &val) in data.iter().enumerate() {
        let x = (i as u32) % w;
        let y = (i as u32) / w;
        result.put_pixel(x, y, image::Luma([if val > 0 { 255 } else { 0 }]));
    }
    result
}

fn count_transitions(neighbors: &[u8; 8]) -> u8 {
    let extended = [
        neighbors[0], neighbors[1], neighbors[2], neighbors[3],
        neighbors[4], neighbors[5], neighbors[6], neighbors[7],
        neighbors[0],
    ];
    let mut count = 0;
    for i in 0..8 {
        if extended[i] == 0 && extended[i + 1] == 1 {
            count += 1;
        }
    }
    count
}

/// Build a wall graph from the binary wall mask using Hough line detection.
/// Returns H/V line segments and junction points.
pub fn build_wall_graph(
    wall_mask_path: &str,
    pipeline_dir: &Path,
) -> Result<WallGraphResult, String> {
    let raw_mask = image::open(wall_mask_path)
        .map_err(|e| format!("Failed to open wall mask: {e}"))?
        .to_luma8();
    let (w, h) = raw_mask.dimensions();
    let img = skeletonize(&raw_mask);

    // Save skeleton for debugging
    let _ = img.save(pipeline_dir.join("wall_skeleton.png"));

    let min_dim = w.min(h);
    let options = LineDetectionOptions {
        vote_threshold: std::cmp::max((min_dim / 20) as u32, 10),
        suppression_radius: 4,
    };
    let polar_lines = detect_lines(&img, options);
    log::info!("Hough detected {} raw lines (from skeleton)", polar_lines.len());

    let h_lines: Vec<&PolarLine> = polar_lines
        .iter()
        .filter(|l| is_near_horizontal(l.angle_in_degrees))
        .collect();
    let v_lines: Vec<&PolarLine> = polar_lines
        .iter()
        .filter(|l| is_near_vertical(l.angle_in_degrees))
        .collect();
    log::info!(
        "Filtered: {} horizontal, {} vertical",
        h_lines.len(),
        v_lines.len()
    );
    let mut segments: Vec<WallSegment> = Vec::new();
    let mut idx = 0;

    for line in &h_lines {
        // Skip lines whose Y position is outside image bounds
        if line.r < 0.0 || line.r > h as f32 {
            continue;
        }
        if let Some((p1, p2)) = find_wall_extent_horizontal(line, &img, w, h) {
            let len = ((p2.0 - p1.0).powi(2) + (p2.1 - p1.1).powi(2)).sqrt();
            if len < 25.0 {
                continue;
            }
            // Skip if endpoints are outside image bounds
            if p1.0 < 0.0 || p2.0 < 0.0 || p1.0 > w as f32 || p2.0 > w as f32 {
                continue;
            }
            idx += 1;
            segments.push(WallSegment {
                id: format!("cv_wall_{idx}"),
                start: [p1.0 as f64, p1.1 as f64],
                end: [p2.0 as f64, p2.1 as f64],
                orientation: "horizontal".into(),
                source: "cv_hough".into(),
                confidence: 0.8,
            });
        }
    }
    for line in &v_lines {
        // Skip lines whose X position is outside image bounds
        let x_pos = if line.angle_in_degrees <= 5 {
            line.r as f32
        } else {
            -(line.r as f32)
        };
        if x_pos < 0.0 || x_pos > w as f32 {
            continue;
        }
        if let Some((p1, p2)) = find_wall_extent_vertical(line, &img, w, h) {
            let len = ((p2.0 - p1.0).powi(2) + (p2.1 - p1.1).powi(2)).sqrt();
            if len < 25.0 {
                continue;
            }
            if p1.0 < 0.0 || p2.0 < 0.0 || p1.0 > w as f32 || p2.0 > w as f32 {
                continue;
            }
            idx += 1;
            segments.push(WallSegment {
                id: format!("cv_wall_{idx}"),
                start: [p1.0 as f64, p1.1 as f64],
                end: [p2.0 as f64, p2.1 as f64],
                orientation: "vertical".into(),
                source: "cv_hough".into(),
                confidence: 0.8,
            });
        }
    }
    segments = merge_collinear_segments(segments, 8.0);
    segments = merge_parallel_segments(segments, 30.0);
    // Re-merge collinear after parallel merge
    segments = merge_collinear_segments(segments, 8.0);
    extend_endpoints_to_walls(&mut segments, 250.0);
    snap_endpoints(&mut segments, 8.0);
    segments.retain(|s| {
        let len = ((s.end[0] - s.start[0]).powi(2) + (s.end[1] - s.start[1]).powi(2)).sqrt();
        len >= 4.0
    });
    let junctions = find_junctions(&segments, 12.0);

    log::info!(
        "Wall graph: {} segments, {} junctions",
        segments.len(),
        junctions.len()
    );

    // Save debug artifacts
    let result = WallGraphResult {
        segments,
        junction_points: junctions,
    };

    if let Ok(json) = serde_json::to_string_pretty(&result) {
        let _ = std::fs::write(pipeline_dir.join("wall_graph.json"), &json);
    }

    if let Ok(json) = serde_json::to_string_pretty(&result.segments) {
        let _ = std::fs::write(pipeline_dir.join("wall_segments.json"), &json);
    }

    Ok(result)
}

/// Find the actual extent of wall pixels along a near-horizontal Hough line.
/// For horizontal lines (angle ≈ 90°): y ≈ r, scan along X.
fn find_wall_extent_horizontal(
    line: &PolarLine,
    mask: &GrayImage,
    width: u32,
    height: u32,
) -> Option<((f32, f32), (f32, f32))> {
    let r = line.r as f32;

    // For horizontal lines (angle=90): y = r
    // For slightly tilted lines: y varies slightly with x
    let theta = (line.angle_in_degrees as f32).to_radians();
    let cos_t = theta.cos();
    let sin_t = theta.sin();
    let half_scan = 6i32; // perpendicular scan range

    let mut wall_xs: Vec<f32> = Vec::new();

    for x in 0..width {
        let xf = x as f32;
        // Compute the line's Y at this X: y = (r - x*cos) / sin
        let y_center = if sin_t.abs() > 0.01 {
            (r - xf * cos_t) / sin_t
        } else {
            r
        };

        let mut found = false;
        for offset in -half_scan..=half_scan {
            let check_y = (y_center + offset as f32).round() as i32;
            if check_y >= 0 && check_y < height as i32 {
                if mask.get_pixel(x, check_y as u32)[0] > 0 {
                    found = true;
                    break;
                }
            }
        }
        if found {
            wall_xs.push(xf);
        }
    }

    if wall_xs.len() < 10 {
        return None;
    }

    let best_run = find_longest_run(&wall_xs, 10.0);
    best_run.map(|(start_x, end_x)| {
        // Compute Y at start and end of the run
        let y_start = if sin_t.abs() > 0.01 { (r - start_x * cos_t) / sin_t } else { r };
        let y_end = if sin_t.abs() > 0.01 { (r - end_x * cos_t) / sin_t } else { r };
        ((start_x, y_start), (end_x, y_end))
    })
}

/// Find the actual extent of wall pixels along a near-vertical Hough line.
/// For vertical lines: angle ≤ 5 → x = r (cos=1), angle ≥ 175 → x = -r (cos=-1)
fn find_wall_extent_vertical(
    line: &PolarLine,
    mask: &GrayImage,
    width: u32,
    height: u32,
) -> Option<((f32, f32), (f32, f32))> {
    let r = line.r as f32;
    let angle = line.angle_in_degrees;

    // For vertical lines, compute the line's X position
    // imageproc convention: angle=0 → x=r, angle=180 → x=-r
    let theta = (angle as f32).to_radians();
    let cos_t = theta.cos();
    let sin_t = theta.sin();
    let half_scan = 6i32;

    let mut wall_ys: Vec<f32> = Vec::new();

    for y in 0..height {
        let yf = y as f32;
        // Compute the line's X at this Y: x = (r - y*sin) / cos
        let x_center = if cos_t.abs() > 0.01 {
            (r - yf * sin_t) / cos_t
        } else {
            r
        };

        let mut found = false;
        for offset in -half_scan..=half_scan {
            let check_x = (x_center + offset as f32).round() as i32;
            if check_x >= 0 && check_x < width as i32 {
                if mask.get_pixel(check_x as u32, y)[0] > 0 {
                    found = true;
                    break;
                }
            }
        }
        if found {
            wall_ys.push(yf);
        }
    }

    if wall_ys.len() < 10 {
        return None;
    }

    let best_run = find_longest_run(&wall_ys, 10.0);
    best_run.map(|(start_y, end_y)| {
        let x_start = if cos_t.abs() > 0.01 { (r - start_y * sin_t) / cos_t } else { r };
        let x_end = if cos_t.abs() > 0.01 { (r - end_y * sin_t) / cos_t } else { r };
        ((x_start, start_y), (x_end, end_y))
    })
}

/// Find the longest contiguous run of values in a sorted array.
/// A gap larger than `gap_threshold` breaks the run.
fn find_longest_run(sorted_values: &[f32], gap_threshold: f32) -> Option<(f32, f32)> {
    if sorted_values.is_empty() {
        return None;
    }

    let mut best_start = sorted_values[0];
    let mut best_end = sorted_values[0];
    let mut best_len = 1;

    let mut cur_start = sorted_values[0];
    let mut cur_len = 1;

    for i in 1..sorted_values.len() {
        if sorted_values[i] - sorted_values[i - 1] <= gap_threshold {
            cur_len += 1;
        } else {
            if cur_len > best_len {
                best_start = cur_start;
                best_end = sorted_values[i - 1];
                best_len = cur_len;
            }
            cur_start = sorted_values[i];
            cur_len = 1;
        }
    }

    // Check the last run
    if cur_len > best_len {
        best_start = cur_start;
        best_end = sorted_values[sorted_values.len() - 1];
    }

    Some((best_start, best_end))
}

/// Check if angle is near-horizontal (82-98 degrees, since Hough uses 90=horizontal)
fn is_near_horizontal(angle: u32) -> bool {
    (82..=98).contains(&angle)
}

/// Check if angle is near-vertical (0-8 or 172-180 degrees)
fn is_near_vertical(angle: u32) -> bool {
    angle <= 8 || angle >= 172
}

/// Merge segments that are collinear and close together.
fn merge_collinear_segments(segments: Vec<WallSegment>, dist_threshold: f64) -> Vec<WallSegment> {
    let mut merged = segments.clone();
    let mut changed = true;

    while changed {
        changed = false;
        let mut new_merged = Vec::new();
        let mut used = vec![false; merged.len()];

        for i in 0..merged.len() {
            if used[i] {
                continue;
            }
            let mut best = merged[i].clone();
            used[i] = true;

            for j in (i + 1)..merged.len() {
                if used[j] {
                    continue;
                }
                if can_merge(&best, &merged[j], dist_threshold) {
                    best = merge_two(&best, &merged[j]);
                    used[j] = true;
                    changed = true;
                }
            }
            new_merged.push(best);
        }
        merged = new_merged;
    }

    merged
}

/// Check if two segments can be merged (same orientation, close, overlapping/nearby).
fn can_merge(a: &WallSegment, b: &WallSegment, dist_threshold: f64) -> bool {
    if a.orientation != b.orientation {
        return false;
    }

    if a.orientation == "horizontal" {
        let ay = (a.start[1] + a.end[1]) / 2.0;
        let by = (b.start[1] + b.end[1]) / 2.0;
        if (ay - by).abs() > dist_threshold {
            return false;
        }
        let a_min_x = a.start[0].min(a.end[0]);
        let a_max_x = a.start[0].max(a.end[0]);
        let b_min_x = b.start[0].min(b.end[0]);
        let b_max_x = b.start[0].max(b.end[0]);
        a_min_x - dist_threshold <= b_max_x && b_min_x - dist_threshold <= a_max_x
    } else {
        let ax = (a.start[0] + a.end[0]) / 2.0;
        let bx = (b.start[0] + b.end[0]) / 2.0;
        if (ax - bx).abs() > dist_threshold {
            return false;
        }
        let a_min_y = a.start[1].min(a.end[1]);
        let a_max_y = a.start[1].max(a.end[1]);
        let b_min_y = b.start[1].min(b.end[1]);
        let b_max_y = b.start[1].max(b.end[1]);
        a_min_y - dist_threshold <= b_max_y && b_min_y - dist_threshold <= a_max_y
    }
}

/// Merge two segments into one (take the spanning range).
fn merge_two(a: &WallSegment, b: &WallSegment) -> WallSegment {
    if a.orientation == "horizontal" {
        let y = (a.start[1] + a.end[1] + b.start[1] + b.end[1]) / 4.0;
        let min_x = a.start[0].min(a.end[0]).min(b.start[0].min(b.end[0]));
        let max_x = a.start[0].max(a.end[0]).max(b.start[0].max(b.end[0]));
        WallSegment {
            id: a.id.clone(),
            start: [min_x, y],
            end: [max_x, y],
            orientation: "horizontal".into(),
            source: "cv_hough".into(),
            confidence: a.confidence.max(b.confidence),
        }
    } else {
        let x = (a.start[0] + a.end[0] + b.start[0] + b.end[0]) / 4.0;
        let min_y = a.start[1].min(a.end[1]).min(b.start[1].min(b.end[1]));
        let max_y = a.start[1].max(a.end[1]).max(b.start[1].max(b.end[1]));
        WallSegment {
            id: a.id.clone(),
            start: [x, min_y],
            end: [x, max_y],
            orientation: "vertical".into(),
            source: "cv_hough".into(),
            confidence: a.confidence.max(b.confidence),
        }
    }
}

/// Extend segment endpoints to intersect with nearby perpendicular walls.
/// For each endpoint, finds the outermost perpendicular wall crossing within
/// a generous threshold (to handle thick walls with inner/outer edges).
fn extend_endpoints_to_walls(segments: &mut [WallSegment], max_extension: f64) {
    let v_walls: Vec<(f64, f64, f64)> = segments.iter()
        .filter(|s| s.orientation == "vertical")
        .map(|s| (s.start[0], s.start[1].min(s.end[1]), s.start[1].max(s.end[1])))
        .collect();

    let h_walls: Vec<(f64, f64, f64)> = segments.iter()
        .filter(|s| s.orientation == "horizontal")
        .map(|s| (s.start[1], s.start[0].min(s.end[0]), s.start[0].max(s.end[0])))
        .collect();

    for seg in segments.iter_mut() {
        if seg.orientation == "horizontal" {
            let y = (seg.start[1] + seg.end[1]) / 2.0;
            // Extend left: find the leftmost vertical wall at this Y within threshold
            let left_x = seg.start[0].min(seg.end[0]);
            if let Some(vx) = v_walls.iter()
                .filter(|(_, y_lo, y_hi)| y >= *y_lo && y <= *y_hi)
                .map(|(vx, _, _)| *vx)
                .filter(|&vx| (left_x - vx).abs() <= max_extension && (left_x - vx).abs() > 1.0)
                .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            {
                if seg.start[0] <= seg.end[0] { seg.start[0] = vx; } else { seg.end[0] = vx; }
            }
            // Extend right: find the rightmost vertical wall at this Y within threshold
            let right_x = seg.start[0].max(seg.end[0]);
            if let Some(vx) = v_walls.iter()
                .filter(|(_, y_lo, y_hi)| y >= *y_lo && y <= *y_hi)
                .map(|(vx, _, _)| *vx)
                .filter(|&vx| (right_x - vx).abs() <= max_extension && (right_x - vx).abs() > 1.0)
                .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            {
                if seg.start[0] >= seg.end[0] { seg.start[0] = vx; } else { seg.end[0] = vx; }
            }
        } else {
            let x = (seg.start[0] + seg.end[0]) / 2.0;
            // Extend up: find the topmost horizontal wall at this X within threshold
            let top_y = seg.start[1].min(seg.end[1]);
            if let Some(hy) = h_walls.iter()
                .filter(|(_, x_lo, x_hi)| x >= *x_lo && x <= *x_hi)
                .map(|(hy, _, _)| *hy)
                .filter(|&hy| (top_y - hy).abs() <= max_extension && (top_y - hy).abs() > 1.0)
                .min_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            {
                if seg.start[1] <= seg.end[1] { seg.start[1] = hy; } else { seg.end[1] = hy; }
            }
            // Extend down: find the bottommost horizontal wall at this X within threshold
            let bottom_y = seg.start[1].max(seg.end[1]);
            if let Some(hy) = h_walls.iter()
                .filter(|(_, x_lo, x_hi)| x >= *x_lo && x <= *x_hi)
                .map(|(hy, _, _)| *hy)
                .filter(|&hy| (bottom_y - hy).abs() <= max_extension && (bottom_y - hy).abs() > 1.0)
                .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            {
                if seg.start[1] >= seg.end[1] { seg.start[1] = hy; } else { seg.end[1] = hy; }
            }
        }
    }
}

/// Snap all endpoints to a grid.
fn snap_endpoints(segments: &mut [WallSegment], grid: f64) {
    for seg in segments.iter_mut() {
        seg.start[0] = (seg.start[0] / grid).round() * grid;
        seg.start[1] = (seg.start[1] / grid).round() * grid;
        seg.end[0] = (seg.end[0] / grid).round() * grid;
        seg.end[1] = (seg.end[1] / grid).round() * grid;
    }
}

/// Find junction points where 2+ segment endpoints are close together.
fn find_junctions(segments: &[WallSegment], threshold: f64) -> Vec<[f64; 2]> {
    let mut all_endpoints: Vec<[f64; 2]> = Vec::new();
    for seg in segments {
        all_endpoints.push(seg.start);
        all_endpoints.push(seg.end);
    }

    let mut junctions = Vec::new();
    let mut used = vec![false; all_endpoints.len()];

    for i in 0..all_endpoints.len() {
        if used[i] {
            continue;
        }
        let mut cluster = vec![i];
        for j in (i + 1)..all_endpoints.len() {
            if used[j] {
                continue;
            }
            let dx = all_endpoints[i][0] - all_endpoints[j][0];
            let dy = all_endpoints[i][1] - all_endpoints[j][1];
            if (dx * dx + dy * dy).sqrt() < threshold {
                cluster.push(j);
            }
        }

        if cluster.len() >= 2 {
            let cx: f64 = cluster.iter().map(|&k| all_endpoints[k][0]).sum::<f64>()
                / cluster.len() as f64;
            let cy: f64 = cluster.iter().map(|&k| all_endpoints[k][1]).sum::<f64>()
                / cluster.len() as f64;
            junctions.push([cx, cy]);
            for &k in &cluster {
                used[k] = true;
            }
        }
    }

    junctions
}

/// Merge parallel segments that represent opposite edges of the same thick wall.
/// Groups segments by perpendicular position (Y for horizontal, X for vertical),
/// clusters those within `dist_threshold`, and outputs one centerline segment per cluster.
fn merge_parallel_segments(segments: Vec<WallSegment>, dist_threshold: f64) -> Vec<WallSegment> {
    let h_segments: Vec<&WallSegment> = segments.iter().filter(|s| s.orientation == "horizontal").collect();
    let v_segments: Vec<&WallSegment> = segments.iter().filter(|s| s.orientation == "vertical").collect();

    let mut result = Vec::new();

    // Merge horizontal segments by Y coordinate
    let mut h_sorted: Vec<(f64, &WallSegment)> = h_segments.iter()
        .map(|s| ((s.start[1] + s.end[1]) / 2.0, *s))
        .collect();
    h_sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut i = 0;
    while i < h_sorted.len() {
        let mut cluster_y_sum = h_sorted[i].0;
        let mut cluster_count = 1;
        let mut min_x = h_sorted[i].1.start[0].min(h_sorted[i].1.end[0]);
        let mut max_x = h_sorted[i].1.start[0].max(h_sorted[i].1.end[0]);
        let mut j = i + 1;
        while j < h_sorted.len() {
            let center = cluster_y_sum / cluster_count as f64;
            if (h_sorted[j].0 - center).abs() < dist_threshold {
                cluster_y_sum += h_sorted[j].0;
                cluster_count += 1;
                min_x = min_x.min(h_sorted[j].1.start[0].min(h_sorted[j].1.end[0]));
                max_x = max_x.max(h_sorted[j].1.start[0].max(h_sorted[j].1.end[0]));
                j += 1;
            } else {
                break;
            }
        }
        let center_y = cluster_y_sum / cluster_count as f64;
        if max_x - min_x > 20.0 {
            result.push(WallSegment {
                id: h_sorted[i].1.id.clone(),
                start: [min_x, center_y],
                end: [max_x, center_y],
                orientation: "horizontal".into(),
                source: "cv_hough".into(),
                confidence: 0.8,
            });
        }
        i = j;
    }

    // Merge vertical segments by X coordinate
    let mut v_sorted: Vec<(f64, &WallSegment)> = v_segments.iter()
        .map(|s| ((s.start[0] + s.end[0]) / 2.0, *s))
        .collect();
    v_sorted.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut i = 0;
    while i < v_sorted.len() {
        let mut cluster_x_sum = v_sorted[i].0;
        let mut cluster_count = 1;
        let mut min_y = v_sorted[i].1.start[1].min(v_sorted[i].1.end[1]);
        let mut max_y = v_sorted[i].1.start[1].max(v_sorted[i].1.end[1]);
        let mut j = i + 1;
        while j < v_sorted.len() {
            let center = cluster_x_sum / cluster_count as f64;
            if (v_sorted[j].0 - center).abs() < dist_threshold {
                cluster_x_sum += v_sorted[j].0;
                cluster_count += 1;
                min_y = min_y.min(v_sorted[j].1.start[1].min(v_sorted[j].1.end[1]));
                max_y = max_y.max(v_sorted[j].1.start[1].max(v_sorted[j].1.end[1]));
                j += 1;
            } else {
                break;
            }
        }
        let center_x = cluster_x_sum / cluster_count as f64;
        if max_y - min_y > 20.0 {
            result.push(WallSegment {
                id: v_sorted[i].1.id.clone(),
                start: [center_x, min_y],
                end: [center_x, max_y],
                orientation: "vertical".into(),
                source: "cv_hough".into(),
                confidence: 0.8,
            });
        }
        i = j;
    }

    log::info!(
        "Parallel merge: {} segments → {} centerlines (threshold={:.0})",
        segments.len(), result.len(), dist_threshold
    );

    result
}
