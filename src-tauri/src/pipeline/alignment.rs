use image::{GrayImage, Luma};
use imageproc::drawing::draw_line_segment_mut;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::Path;

use super::plan_graph::PlanGraphJSON;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlignmentScores {
    pub wall_iou: f64,
    pub wall_precision: f64,
    pub wall_recall: f64,
    pub overall: f64,
}

/// Compute alignment between the CV wall mask and the PlanGraphJSON geometry.
/// Uses distance-based comparison: a wall pixel is "covered" if it's within D pixels
/// of any segment, and a segment pixel is "valid" if it's within D pixels of any
/// wall pixel. D ≈ half typical wall thickness. This avoids the imprecision of
/// rendering segments with a specific thickness.
pub fn compute_alignment(
    wall_mask_path: &str,
    plan_graph: &PlanGraphJSON,
    image_width: u32,
    image_height: u32,
    pipeline_dir: &Path,
) -> AlignmentScores {
    let mask_img = image::open(wall_mask_path)
        .map_err(|e| format!("Failed to open wall mask: {e}"));
    let mask = match mask_img {
        Ok(img) => img.to_luma8(),
        Err(e) => {
            log::warn!("Cannot compute alignment: {e}");
            return AlignmentScores {
                wall_iou: 0.0,
                wall_precision: 0.0,
                wall_recall: 0.0,
                overall: 0.0,
            };
        }
    };

    let w = image_width;
    let h = image_height;

    // Render thin (1px) segment lines for distance computation
    let thin_rendered = render_thin_segments(plan_graph, w, h);

    // Save rendered structure mask (with thickness) for debug visualization
    let rendered = render_structure_mask(plan_graph, &mask, w, h);
    let rendered_path = pipeline_dir.join("rendered_structure_mask.png");
    if let Err(e) = rendered.save(&rendered_path) {
        log::warn!("Failed to save rendered structure mask: {e}");
    }

    // Distance tolerance: half of typical wall width
    let tolerance = 5i32;

    // BFS distance from thin_rendered pixels
    let dist_from_segments = bfs_distance(&thin_rendered, w, h);
    // BFS distance from mask pixels
    let dist_from_mask = bfs_distance(&mask, w, h);

    // Recall: fraction of mask pixels within tolerance of any segment
    let mut mask_count = 0u64;
    let mut mask_covered = 0u64;
    for y in 0..h {
        for x in 0..w {
            if mask.get_pixel(x, y)[0] > 0 {
                mask_count += 1;
                let idx = (y * w + x) as usize;
                if dist_from_segments[idx] <= tolerance {
                    mask_covered += 1;
                }
            }
        }
    }

    // Precision: fraction of segment pixels within tolerance of any mask pixel
    let mut seg_count = 0u64;
    let mut seg_valid = 0u64;
    for y in 0..h {
        for x in 0..w {
            if thin_rendered.get_pixel(x, y)[0] > 0 {
                seg_count += 1;
                let idx = (y * w + x) as usize;
                if dist_from_mask[idx] <= tolerance {
                    seg_valid += 1;
                }
            }
        }
    }

    let recall = if mask_count > 0 { mask_covered as f64 / mask_count as f64 } else { 0.0 };
    let precision = if seg_count > 0 { seg_valid as f64 / seg_count as f64 } else { 0.0 };

    // IoU approximation using tolerance-based coverage
    let mut both_covered = 0u64;
    let mut either_covered = 0u64;
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            let near_seg = dist_from_segments[idx] <= tolerance;
            let near_mask = dist_from_mask[idx] <= tolerance;
            if near_seg && near_mask {
                both_covered += 1;
            }
            if near_seg || near_mask {
                either_covered += 1;
            }
        }
    }
    let iou = if either_covered > 0 { both_covered as f64 / either_covered as f64 } else { 0.0 };

    let overall = 0.3 * precision + 0.5 * recall + 0.2 * iou;

    log::info!(
        "Alignment distance: mask_pixels={}, covered={}, seg_pixels={}, valid={}",
        mask_count, mask_covered, seg_count, seg_valid,
    );

    let scores = AlignmentScores {
        wall_iou: (iou * 1000.0).round() / 1000.0,
        wall_precision: (precision * 1000.0).round() / 1000.0,
        wall_recall: (recall * 1000.0).round() / 1000.0,
        overall: (overall * 1000.0).round() / 1000.0,
    };

    log::info!(
        "Alignment: IoU={:.3}, Precision={:.3}, Recall={:.3}, Overall={:.3}",
        scores.wall_iou,
        scores.wall_precision,
        scores.wall_recall,
        scores.overall,
    );

    scores
}

/// BFS-based distance transform from all white pixels.
/// Returns a flat array where dist[y*w+x] = distance to nearest white pixel (or i32::MAX).
fn bfs_distance(img: &GrayImage, w: u32, h: u32) -> Vec<i32> {
    let size = (w * h) as usize;
    let mut dist = vec![i32::MAX; size];
    let mut queue = VecDeque::new();

    // Initialize: all white pixels have distance 0
    for y in 0..h {
        for x in 0..w {
            if img.get_pixel(x, y)[0] > 0 {
                let idx = (y * w + x) as usize;
                dist[idx] = 0;
                queue.push_back((x, y));
            }
        }
    }

    // BFS
    while let Some((cx, cy)) = queue.pop_front() {
        let idx = (cy * w + cx) as usize;
        let d = dist[idx];
        for (dx, dy) in &[(0i32, 1i32), (0, -1), (1, 0), (-1, 0)] {
            let nx = cx as i32 + dx;
            let ny = cy as i32 + dy;
            if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                let nidx = (ny as u32 * w + nx as u32) as usize;
                if d + 1 < dist[nidx] {
                    dist[nidx] = d + 1;
                    queue.push_back((nx as u32, ny as u32));
                }
            }
        }
    }

    dist
}

/// Render wall segments and face polygon edges as thin (1px) lines.
fn render_thin_segments(plan_graph: &PlanGraphJSON, width: u32, height: u32) -> GrayImage {
    let mut mask = GrayImage::new(width, height);
    let white = Luma([255u8]);

    for seg in &plan_graph.wall_segments {
        draw_line_segment_mut(
            &mut mask,
            (seg.start[0] as f32, seg.start[1] as f32),
            (seg.end[0] as f32, seg.end[1] as f32),
            white,
        );
    }

    for face in &plan_graph.faces {
        let poly = &face.polygon;
        for i in 0..poly.len() {
            let j = (i + 1) % poly.len();
            draw_line_segment_mut(
                &mut mask,
                (poly[i][0] as f32, poly[i][1] as f32),
                (poly[j][0] as f32, poly[j][1] as f32),
                white,
            );
        }
    }

    mask
}

/// Measure the wall width (in pixels) perpendicular to a segment.
/// Samples at multiple interior points (avoiding junction regions),
/// measures the full span of wall pixels, and returns the median.
fn measure_wall_width(mask: &GrayImage, sx: f64, sy: f64, ex: f64, ey: f64) -> i32 {
    let w = mask.width() as i32;
    let h = mask.height() as i32;
    let is_vertical = (sx - ex).abs() < (sy - ey).abs();
    let max_scan = 20i32;

    let fractions = [0.25, 0.35, 0.5, 0.65, 0.75];
    let mut measurements = Vec::new();

    for &f in &fractions {
        let mx = (sx + (ex - sx) * f) as i32;
        let my = (sy + (ey - sy) * f) as i32;

        if mx < 0 || mx >= w || my < 0 || my >= h {
            continue;
        }

        let mut min_wall = max_scan;
        let mut max_wall = -max_scan;

        if is_vertical {
            for d in -max_scan..=max_scan {
                let px = mx + d;
                if px >= 0 && px < w && mask.get_pixel(px as u32, my as u32)[0] > 0 {
                    min_wall = min_wall.min(d);
                    max_wall = max_wall.max(d);
                }
            }
        } else {
            for d in -max_scan..=max_scan {
                let py = my + d;
                if py >= 0 && py < h && mask.get_pixel(mx as u32, py as u32)[0] > 0 {
                    min_wall = min_wall.min(d);
                    max_wall = max_wall.max(d);
                }
            }
        }

        if max_wall >= min_wall {
            measurements.push(max_wall - min_wall + 1);
        }
    }

    if measurements.is_empty() {
        return 3;
    }

    measurements.sort();
    let median = measurements[measurements.len() / 2];
    median.max(1).min(max_scan as i32 * 2)
}

/// Render a binary mask from PlanGraphJSON wall segments and face polygon edges.
/// Uses adaptive thickness: measures actual wall width from the mask for each segment.
/// Used for debug visualization only.
fn render_structure_mask(
    plan_graph: &PlanGraphJSON,
    wall_mask: &GrayImage,
    width: u32,
    height: u32,
) -> GrayImage {
    let mut mask = GrayImage::new(width, height);
    let white = Luma([255u8]);

    for seg in &plan_graph.wall_segments {
        let sx = seg.start[0] as f32;
        let sy = seg.start[1] as f32;
        let ex = seg.end[0] as f32;
        let ey = seg.end[1] as f32;

        let measured = measure_wall_width(wall_mask, seg.start[0], seg.start[1], seg.end[0], seg.end[1]);
        let half_thick = (measured / 2).max(1);

        let is_vertical = (sx - ex).abs() < (sy - ey).abs();

        for offset in -half_thick..=half_thick {
            let off = offset as f32;
            if is_vertical {
                draw_line_segment_mut(&mut mask, (sx + off, sy), (ex + off, ey), white);
            } else {
                draw_line_segment_mut(&mut mask, (sx, sy + off), (ex, ey + off), white);
            }
        }
    }

    for face in &plan_graph.faces {
        let poly = &face.polygon;
        for i in 0..poly.len() {
            let j = (i + 1) % poly.len();
            let sx = poly[i][0] as f32;
            let sy = poly[i][1] as f32;
            let ex = poly[j][0] as f32;
            let ey = poly[j][1] as f32;
            draw_line_segment_mut(&mut mask, (sx, sy), (ex, ey), white);
        }
    }

    mask
}
