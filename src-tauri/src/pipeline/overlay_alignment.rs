use image::Rgba;
use imageproc::drawing::draw_filled_circle_mut;
use serde::{Deserialize, Serialize};
use std::path::Path;

use super::alignment::AlignmentScores;
use super::plan_graph::PlanGraphJSON;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosisReport {
    pub missing_wall_regions: Vec<WallRegion>,
    pub extra_wall_regions: Vec<WallRegion>,
    pub scale_suspicious: bool,
    pub scale_reason: Option<String>,
    pub door_binding_errors: Vec<BindingError>,
    pub window_binding_errors: Vec<BindingError>,
    pub room_coverage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallRegion {
    pub bbox: [f64; 4],
    pub length_px: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BindingError {
    pub opening_id: String,
    pub issue: String,
    pub distance_px: f64,
}

const COLOR_MATCHED: Rgba<u8> = Rgba([50, 200, 50, 180]);   // green
const COLOR_MISSING: Rgba<u8> = Rgba([255, 50, 50, 200]);    // red
const COLOR_EXTRA: Rgba<u8> = Rgba([50, 100, 255, 200]);     // blue
const COLOR_DOOR: Rgba<u8> = Rgba([50, 200, 50, 255]);       // green
const COLOR_WINDOW: Rgba<u8> = Rgba([50, 150, 255, 255]);    // blue

/// Generate alignment overlay and diagnosis report.
pub fn generate_alignment_overlay(
    processed_path: &str,
    wall_mask_path: &str,
    plan_graph: &PlanGraphJSON,
    alignment: &AlignmentScores,
    pipeline_dir: &Path,
) -> DiagnosisReport {
    // Load base image
    let base_img = image::open(processed_path);
    let wall_mask_img = image::open(wall_mask_path);

    let (base, mask) = match (base_img, wall_mask_img) {
        (Ok(b), Ok(m)) => (b.to_rgba8(), m.to_luma8()),
        _ => {
            log::warn!("Cannot generate alignment overlay: failed to load images");
            return empty_diagnosis();
        }
    };

    let mut canvas = base;
    let w = canvas.width();
    let h = canvas.height();

    // Load rendered structure mask
    let rendered_path = pipeline_dir.join("rendered_structure_mask.png");
    let rendered = image::open(&rendered_path)
        .map(|img| img.to_luma8())
        .unwrap_or_else(|_| image::GrayImage::new(w, h));

    // Draw alignment overlay pixel by pixel (sample every 2 pixels for performance)
    for y in (0..h).step_by(2) {
        for x in (0..w).step_by(2) {
            let m = mask.get_pixel(x, y)[0] > 0;
            let r = rendered.get_pixel(x, y)[0] > 0;

            let color = match (m, r) {
                (true, true) => Some(COLOR_MATCHED),
                (true, false) => Some(COLOR_MISSING),
                (false, true) => Some(COLOR_EXTRA),
                (false, false) => None,
            };

            if let Some(c) = color {
                canvas.put_pixel(x, y, c);
                // Fill 2x2 block
                if x + 1 < w {
                    canvas.put_pixel(x + 1, y, c);
                }
                if y + 1 < h {
                    canvas.put_pixel(x, y + 1, c);
                }
                if x + 1 < w && y + 1 < h {
                    canvas.put_pixel(x + 1, y + 1, c);
                }
            }
        }
    }

    // Draw door positions
    for door in &plan_graph.doors {
        let x = door.position[0] as i32;
        let y = door.position[1] as i32;
        if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
            draw_filled_circle_mut(&mut canvas, (x, y), 6, COLOR_DOOR);
        }
    }

    // Draw window positions
    for win in &plan_graph.windows {
        let x = win.position[0] as i32;
        let y = win.position[1] as i32;
        if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
            draw_filled_circle_mut(&mut canvas, (x, y), 6, COLOR_WINDOW);
        }
    }

    // Draw room labels at centroids
    for label in &plan_graph.labels {
        let x = label.centroid[0] as i32;
        let y = label.centroid[1] as i32;
        if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
            draw_filled_circle_mut(&mut canvas, (x, y), 4, Rgba([255, 255, 0, 255]));
        }
    }

    // Save overlay
    let overlay_path = pipeline_dir.join("overlay_alignment.png");
    if let Err(e) = canvas.save(&overlay_path) {
        log::warn!("Failed to save alignment overlay: {e}");
    }

    // Generate diagnosis
    let diagnosis = generate_diagnosis(plan_graph, alignment, &mask, &rendered, w, h);

    // Save diagnosis
    if let Ok(json) = serde_json::to_string_pretty(&diagnosis) {
        let _ = std::fs::write(pipeline_dir.join("diagnosis.json"), json);
    }

    diagnosis
}

fn generate_diagnosis(
    plan_graph: &PlanGraphJSON,
    _alignment: &AlignmentScores,
    mask: &image::GrayImage,
    rendered: &image::GrayImage,
    _w: u32,
    _h: u32,
) -> DiagnosisReport {
    // Find missing wall regions (connected components in mask but not in rendered)
    let missing_regions = find_diff_regions(mask, rendered, "missing");
    let extra_regions = find_diff_regions(rendered, mask, "extra");

    // Check scale
    let (scale_suspicious, scale_reason) = check_scale(plan_graph);

    // Check door/window binding
    let door_errors = check_opening_binding(&plan_graph.doors, &plan_graph.wall_segments);
    let window_errors = check_opening_binding(&plan_graph.windows, &plan_graph.wall_segments);

    // Room coverage
    let mask_white = mask.pixels().filter(|p| p[0] > 0).count() as f64;
    let _rendered_white = rendered.pixels().filter(|p| p[0] > 0).count() as f64;
    let intersection = mask
        .pixels()
        .zip(rendered.pixels())
        .filter(|(m, r)| m[0] > 0 && r[0] > 0)
        .count() as f64;
    let room_coverage = if mask_white > 0.0 {
        intersection / mask_white
    } else {
        0.0
    };

    DiagnosisReport {
        missing_wall_regions: missing_regions,
        extra_wall_regions: extra_regions,
        scale_suspicious,
        scale_reason,
        door_binding_errors: door_errors,
        window_binding_errors: window_errors,
        room_coverage: (room_coverage * 1000.0).round() / 1000.0,
    }
}

/// Find bounding boxes of regions present in `a` but not in `b`.
fn find_diff_regions(
    a: &image::GrayImage,
    b: &image::GrayImage,
    label: &str,
) -> Vec<WallRegion> {
    let w = a.width().min(b.width());
    let h = a.height().min(b.height());
    let mut regions = Vec::new();

    // Simple approach: scan rows and find contiguous diff spans
    let mut diff_pixels = 0u64;
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    for y in 0..h {
        for x in 0..w {
            let a_val = a.get_pixel(x, y)[0] > 0;
            let b_val = b.get_pixel(x, y)[0] > 0;
            if a_val && !b_val {
                diff_pixels += 1;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if diff_pixels > 50 {
        regions.push(WallRegion {
            bbox: [min_x as f64, min_y as f64, (max_x - min_x) as f64, (max_y - min_y) as f64],
            length_px: diff_pixels as f64,
            description: format!("{} wall region: {} pixels", label, diff_pixels),
        });
    }

    regions
}

fn check_scale(plan_graph: &PlanGraphJSON) -> (bool, Option<String>) {
    // Check if overall dimensions are reasonable
    if plan_graph.faces.is_empty() {
        return (true, Some("No faces detected".into()));
    }

    let mut all_x = Vec::new();
    let mut all_y = Vec::new();
    for face in &plan_graph.faces {
        for p in &face.polygon {
            all_x.push(p[0]);
            all_y.push(p[1]);
        }
    }

    if all_x.is_empty() {
        return (true, Some("No polygon points".into()));
    }

    let w = all_x.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - all_x.iter().copied().fold(f64::INFINITY, f64::min);
    let h = all_y.iter().copied().fold(f64::NEG_INFINITY, f64::max)
        - all_y.iter().copied().fold(f64::INFINITY, f64::min);

    // Check scale candidates
    if let Some(best) = plan_graph.scale_candidates.iter().max_by(|a, b| {
        a.confidence
            .partial_cmp(&b.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    }) {
        let real_w = w * best.meters_per_pixel;
        let real_h = h * best.meters_per_pixel;
        if real_w < 2.0 || real_w > 50.0 || real_h < 2.0 || real_h > 50.0 {
            return (
                true,
                Some(format!(
                    "Dimensions {:.1}x{:.1}m outside 2-50m range",
                    real_w, real_h
                )),
            );
        }
    }

    (false, None)
}

fn check_opening_binding<T>(
    _openings: &[T],
    _walls: &[super::plan_graph::WallSegment],
) -> Vec<BindingError> {
    // This is a simplified check — in practice we'd need a generic trait
    // For now, return empty since door/window binding is checked in validate.rs
    Vec::new()
}

fn empty_diagnosis() -> DiagnosisReport {
    DiagnosisReport {
        missing_wall_regions: Vec::new(),
        extra_wall_regions: Vec::new(),
        scale_suspicious: false,
        scale_reason: None,
        door_binding_errors: Vec::new(),
        window_binding_errors: Vec::new(),
        room_coverage: 0.0,
    }
}
