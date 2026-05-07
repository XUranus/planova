use image::{Rgba, RgbaImage};
use imageproc::drawing::{draw_line_segment_mut, draw_filled_circle_mut};
use std::path::Path;

const ROOM_COLORS: &[[u8; 4]] = &[
    [255, 100, 100, 200], // red - living_room
    [100, 200, 255, 200], // blue - bedroom
    [100, 255, 100, 200], // green - kitchen
    [255, 200, 100, 200], // orange - bathroom
    [200, 100, 255, 200], // purple - dining_room
    [255, 255, 100, 200], // yellow - balcony
    [150, 150, 150, 200], // gray - corridor
    [100, 255, 200, 200], // teal - study
];

const DOOR_COLOR: Rgba<u8> = Rgba([50, 200, 50, 255]);
const WINDOW_COLOR: Rgba<u8> = Rgba([50, 150, 255, 255]);
const WALL_ENDPOINT_COLOR: Rgba<u8> = Rgba([255, 50, 50, 200]);
const LABEL_BG: Rgba<u8> = Rgba([0, 0, 0, 180]);
const LABEL_TEXT: Rgba<u8> = Rgba([255, 255, 255, 255]);

pub fn generate_overlay(
    processed_path: &str,
    raw_vlm: &serde_json::Value,
    pipeline_dir: &Path,
) -> Result<(), String> {
    let img = image::open(processed_path)
        .map_err(|e| format!("Failed to open preprocessed image: {e}"))?;
    let mut canvas: RgbaImage = img.to_rgba8();
    let width = canvas.width() as i32;
    let height = canvas.height() as i32;

    // Draw rooms
    if let Some(rooms) = raw_vlm.get("detected_rooms").and_then(|v| v.as_array()) {
        for (i, room) in rooms.iter().enumerate() {
            let color = Rgba(ROOM_COLORS[i % ROOM_COLORS.len()]);
            let room_type = room.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
            let room_name = room.get("name").and_then(|v| v.as_str()).unwrap_or(room_type);

            if let Some(poly) = room.get("polygon").and_then(|v| v.as_array()) {
                let points: Vec<(i32, i32)> = poly
                    .iter()
                    .filter_map(|p| {
                        let x = p.get(0).and_then(|v| v.as_f64())? as i32;
                        let y = p.get(1).and_then(|v| v.as_f64())? as i32;
                        if x >= 0 && x < width && y >= 0 && y < height {
                            Some((x, y))
                        } else {
                            None
                        }
                    })
                    .collect();

                if points.len() >= 2 {
                    // Draw polygon edges
                    for i in 0..points.len() {
                        let j = (i + 1) % points.len();
                        draw_line_segment_mut(
                            &mut canvas,
                            (points[i].0 as f32, points[i].1 as f32),
                            (points[j].0 as f32, points[j].1 as f32),
                            color,
                        );
                    }

                    // Draw label at centroid
                    let cx: i32 = points.iter().map(|p| p.0).sum::<i32>() / points.len() as i32;
                    let cy: i32 = points.iter().map(|p| p.1).sum::<i32>() / points.len() as i32;
                    draw_label(&mut canvas, room_name, cx, cy);
                }
            }
        }
    }

    // Draw walls
    if let Some(walls) = raw_vlm.get("detected_walls").and_then(|v| v.as_array()) {
        for wall in walls {
            let start = wall.get("start").and_then(|v| v.as_array());
            let end = wall.get("end").and_then(|v| v.as_array());

            if let (Some(s), Some(e)) = (start, end) {
                let sx = s.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let sy = s.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let ex = e.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                let ey = e.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;

                // Draw wall line
                draw_line_segment_mut(
                    &mut canvas,
                    (sx, sy),
                    (ex, ey),
                    Rgba([200, 200, 200, 200]),
                );

                // Draw wall endpoints
                draw_filled_circle_mut(&mut canvas, (sx as i32, sy as i32), 3, WALL_ENDPOINT_COLOR);
                draw_filled_circle_mut(&mut canvas, (ex as i32, ey as i32), 3, WALL_ENDPOINT_COLOR);
            }
        }
    }

    // Draw doors
    if let Some(doors) = raw_vlm.get("detected_doors").and_then(|v| v.as_array()) {
        for door in doors {
            if let Some(pos) = door.get("position").and_then(|v| v.as_array()) {
                let x = pos.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                let y = pos.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                draw_filled_circle_mut(&mut canvas, (x, y), 5, DOOR_COLOR);
                draw_label(&mut canvas, "D", x, y);
            }
        }
    }

    // Draw windows
    if let Some(windows) = raw_vlm.get("detected_windows").and_then(|v| v.as_array()) {
        for window in windows {
            if let Some(pos) = window.get("position").and_then(|v| v.as_array()) {
                let x = pos.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                let y = pos.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0) as i32;
                draw_filled_circle_mut(&mut canvas, (x, y), 5, WINDOW_COLOR);
                draw_label(&mut canvas, "W", x, y);
            }
        }
    }

    // Save overlay
    let overlay_path = pipeline_dir.join("overlay_debug.png");
    canvas
        .save(&overlay_path)
        .map_err(|e| format!("Failed to save overlay: {e}"))?;

    log::info!("Overlay saved to {}", overlay_path.display());
    Ok(())
}

fn draw_label(canvas: &mut RgbaImage, text: &str, x: i32, y: i32) {
    let width = canvas.width() as i32;
    let height = canvas.height() as i32;

    // Simple bitmap font: draw text as a small rectangle with text
    // Since we don't have a proper font loaded, we'll draw a background box
    // and indicate the label position
    let label_width = (text.len() as i32 * 6).max(12);
    let label_height = 10;

    let x1 = (x - label_width / 2).max(0);
    let y1 = (y - label_height / 2).max(0);
    let x2 = (x1 + label_width).min(width - 1);
    let y2 = (y1 + label_height).min(height - 1);

    // Draw background
    for py in y1..=y2 {
        for px in x1..=x2 {
            canvas.put_pixel(px as u32, py as u32, LABEL_BG);
        }
    }

    // Draw border
    for px in x1..=x2 {
        canvas.put_pixel(px as u32, y1 as u32, LABEL_TEXT);
        canvas.put_pixel(px as u32, y2 as u32, LABEL_TEXT);
    }
    for py in y1..=y2 {
        canvas.put_pixel(x1 as u32, py as u32, LABEL_TEXT);
        canvas.put_pixel(x2 as u32, py as u32, LABEL_TEXT);
    }

    // Draw a simple dot to indicate label center
    draw_filled_circle_mut(canvas, (x, y), 2, LABEL_TEXT);
}
