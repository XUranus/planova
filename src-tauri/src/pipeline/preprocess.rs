use std::path::Path;

use image::DynamicImage;

pub fn preprocess_floor_plan(input_path: &str) -> Result<String, String> {
    let img = image::open(input_path).map_err(|e| format!("Could not read image: {e}"))?;
    log::info!("Input image: {}x{}", img.width(), img.height());

    // Resize first to cap memory usage before heavy processing
    let img = resize_if_large(img, 2048);

    // Convert to grayscale for processing
    let gray = img.to_luma8();

    // Auto-rotate correction
    let img = correct_rotation(img, &gray);

    // Crop to content area
    let img = crop_content(img);

    // Save to temp file
    let ext = Path::new(input_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let output_path = std::env::temp_dir().join(format!(
        "planova_processed_{}.{}",
        uuid::Uuid::new_v4().simple(),
        ext
    ));
    img.save(&output_path)
        .map_err(|e| format!("Failed to save processed image: {e}"))?;

    Ok(output_path.to_string_lossy().to_string())
}

fn correct_rotation(img: DynamicImage, gray: &image::GrayImage) -> DynamicImage {
    use imageproc::edges::canny;

    // Canny edge detection
    let edges = canny(gray, 50.0, 150.0);

    // Simple Hough-like line detection: collect angles from edge pixels
    // using gradient direction sampling
    let mut angles: Vec<f64> = Vec::new();
    let (w, h) = edges.dimensions();

    // Sample edge pixels and compute local gradient angles
    for y in 1..h - 1 {
        for x in 1..w - 1 {
            if edges.get_pixel(x, y)[0] > 0 {
                // Compute gradient using Sobel-like approximation
                let gx = gray.get_pixel(x + 1, y)[0] as f64 - gray.get_pixel(x - 1, y)[0] as f64;
                let gy = gray.get_pixel(x, y + 1)[0] as f64 - gray.get_pixel(x, y - 1)[0] as f64;

                if gx.abs() + gy.abs() > 10.0 {
                    let angle = gy.atan2(gx).to_degrees();
                    // Normalize to near-horizontal/vertical
                    let norm_angle = if angle > 45.0 {
                        angle - 90.0
                    } else if angle < -45.0 {
                        angle + 90.0
                    } else {
                        angle
                    };
                    if norm_angle.abs() < 5.0 {
                        angles.push(norm_angle);
                    }
                }
            }
        }
    }

    if angles.is_empty() {
        return img;
    }

    // Compute median angle
    angles.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median_angle = angles[angles.len() / 2];

    if median_angle.abs() < 0.5 {
        return img;
    }

    log::info!("Rotation correction: {:.2} degrees", median_angle);

    use imageproc::geometric_transformations::{rotate_about_center, Interpolation};

    let rgba = img.to_rgba8();
    let rad = (median_angle as f32).to_radians();
    let rotated = rotate_about_center(
        &rgba,
        rad,
        Interpolation::Bilinear,
        image::Rgba([255, 255, 255, 255]),
    );

    DynamicImage::ImageRgba8(rotated)
}

fn crop_content(img: DynamicImage) -> DynamicImage {
    let gray = img.to_luma8();
    let (w, h) = gray.dimensions();

    // Find non-white pixels (threshold at 240)
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;
    let mut found = false;

    for y in 0..h {
        for x in 0..w {
            if gray.get_pixel(x, y)[0] < 240 {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                found = true;
            }
        }
    }

    if !found || max_x <= min_x || max_y <= min_y {
        return img;
    }

    // Add padding (20px)
    let pad = 20u32;
    let x0 = min_x.saturating_sub(pad);
    let y0 = min_y.saturating_sub(pad);
    let x1 = (max_x + pad).min(w.saturating_sub(1));
    let y1 = (max_y + pad).min(h.saturating_sub(1));

    if x1 <= x0 || y1 <= y0 {
        return img;
    }
    let cw = x1 - x0;
    let ch = y1 - y0;

    if cw < 100 || ch < 100 {
        return img;
    }

    log::info!("Cropped: {}x{} -> {}x{}", w, h, cw, ch);
    img.crop_imm(x0, y0, cw, ch)
}

fn resize_if_large(img: DynamicImage, max_size: u32) -> DynamicImage {
    let (w, h) = (img.width(), img.height());
    let longest = w.max(h);
    if longest <= max_size {
        return img;
    }

    let scale = max_size as f64 / longest as f64;
    let new_w = (w as f64 * scale) as u32;
    let new_h = (h as f64 * scale) as u32;

    log::info!("Resized: {}x{} -> {}x{}", w, h, new_w, new_h);
    img.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3)
}
