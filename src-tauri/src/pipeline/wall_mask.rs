use image::GrayImage;
use std::path::Path;

/// Extract a binary wall mask from the preprocessed floor plan image.
/// Uses intensity thresholding to isolate dark pixels (walls),
/// then filters by connected component area and spatial region to remove
/// title blocks, legends, and other annotation artifacts.
/// Returns the path to the saved wall_mask.png.
pub fn extract_wall_mask(processed_path: &str, pipeline_dir: &Path) -> Result<String, String> {
    let img = image::open(processed_path)
        .map_err(|e| format!("Failed to open preprocessed image: {e}"))?;
    let gray = img.to_luma8();
    let (w, h) = gray.dimensions();
    let total_pixels = (w * h) as f64;

    // Step 1: Intensity threshold — capture only dark pixels (walls)
    // Walls in Chinese floor plans are drawn in black/dark gray.
    // Colored rooms, dimension annotations, and text have lighter pixels.
    let mut thresholded = GrayImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let val = gray.get_pixel(x, y)[0];
            if val < 70 {
                thresholded.put_pixel(x, y, image::Luma([255]));
            }
        }
    }

    let dark_count = thresholded.pixels().filter(|p| p[0] > 0).count();
    log::info!(
        "Dark pixels after threshold: {} ({:.1}%)",
        dark_count,
        dark_count as f64 / total_pixels * 100.0
    );

    // Step 2: Filter thin components (title block lines, legend dividers).
    // Title block lines are thin (2-3px) but long (span image width).
    // Floor plan walls are thick (5-10px). We filter by minimum bounding box
    // dimension to reject thin annotation lines while keeping wall structures.
    let min_area = ((w * h) as f64 * 0.0003).max(100.0) as u32;
    let wall_only = filter_by_thickness(&thresholded, min_area, 5);

    // Step 3: Detect floor plan region from the wall-only image.
    // Only thick wall-like components contribute to density, so title block
    // lines (filtered as thin) don't inflate row density.
    let (fp_y_start, fp_y_end, fp_x_start, fp_x_end) =
        detect_floor_plan_region(&wall_only, w, h);

    // Step 4: Small morphological close to bridge tiny gaps in walls
    // (e.g., where a dimension line crosses a wall and creates a small break)
    let closed = morph_close(&thresholded, 1);

    // Step 5: Second CC pass on closed image + area filter + region filter
    let (labels, num_labels) = connected_components(&closed);

    // Compute bounding box for region filter (with 5% margin)
    let margin = (h as f64 * 0.05) as i32;
    let bbox_min_x = (fp_x_start as i32 - margin).max(0) as u32;
    let bbox_min_y = (fp_y_start as i32 - margin).max(0) as u32;
    let bbox_max_x = (fp_x_end as i32 + margin).min(w as i32) as u32;
    let bbox_max_y = (fp_y_end as i32 + margin).min(h as i32) as u32;

    // Precompute component metadata
    let mut comp_meta: Vec<(u32, f64, f64)> = Vec::new(); // (area, centroid_x, centroid_y)
    for label_id in 1..=num_labels {
        let mut area = 0u32;
        let mut sum_x = 0.0f64;
        let mut sum_y = 0.0f64;
        for y in 0..h {
            for x in 0..w {
                if labels[(y * w + x) as usize] == label_id {
                    area += 1;
                    sum_x += x as f64;
                    sum_y += y as f64;
                }
            }
        }
        if area > 0 {
            comp_meta.push((area, sum_x / area as f64, sum_y / area as f64));
        }
    }

    let mut filtered = GrayImage::new(w, h);
    let mut kept_components = 0;
    let mut kept_pixels = 0u32;

    for (i, label_id) in (1..=num_labels).enumerate() {
        let (area, cx, cy) = comp_meta[i];

        // Area filter
        if area < min_area {
            continue;
        }

        // Region filter: remove components outside the detected floor plan region
        if cx < bbox_min_x as f64
            || cx > bbox_max_x as f64
            || cy < bbox_min_y as f64
            || cy > bbox_max_y as f64
        {
            continue;
        }

        kept_components += 1;
        for y in 0..h {
            for x in 0..w {
                if labels[(y * w + x) as usize] == label_id {
                    filtered.put_pixel(x, y, image::Luma([255]));
                    kept_pixels += 1;
                }
            }
        }
    }

    let wall_ratio = kept_pixels as f64 / total_pixels;
    log::info!(
        "Wall mask: {}x{}, {} components kept, {} wall pixels ({:.1}%)",
        w, h, kept_components, kept_pixels, wall_ratio * 100.0
    );

    if wall_ratio < 0.005 {
        log::warn!(
            "Wall mask has very few wall pixels ({:.2}%) — image may not contain clear walls",
            wall_ratio * 100.0
        );
    }
    if wall_ratio > 0.5 {
        log::warn!(
            "Wall mask has too many wall pixels ({:.1}%) — threshold may be too aggressive",
            wall_ratio * 100.0
        );
    }

    // Save
    let mask_path = pipeline_dir.join("wall_mask.png");
    filtered
        .save(&mask_path)
        .map_err(|e| format!("Failed to save wall mask: {e}"))?;

    log::info!("Wall mask saved to {}", mask_path.display());
    Ok(mask_path.to_string_lossy().to_string())
}

/// Filter a binary image to keep only components with minimum bounding box
/// dimension >= min_thickness. This removes thin annotation lines (title blocks,
/// legends) while keeping thick wall structures.
fn filter_by_thickness(
    binary: &GrayImage,
    min_area: u32,
    min_thickness: u32,
) -> GrayImage {
    let (w, h) = binary.dimensions();
    let (labels, num_labels) = connected_components(binary);

    // Compute bounding boxes
    let mut bboxes: Vec<(u32, u32, u32, u32)> = vec![(w, h, 0, 0); (num_labels + 1) as usize];
    for y in 0..h {
        for x in 0..w {
            let lid = labels[(y * w + x) as usize];
            if lid > 0 {
                let bb = &mut bboxes[lid as usize];
                bb.0 = bb.0.min(x);
                bb.1 = bb.1.min(y);
                bb.2 = bb.2.max(x);
                bb.3 = bb.3.max(y);
            }
        }
    }

    let mut out = GrayImage::new(w, h);
    for label_id in 1..=num_labels {
        let area = count_pixels(&labels, w, h, label_id);
        if area < min_area {
            continue;
        }
        let bb = bboxes[label_id as usize];
        let bw = bb.2 - bb.0 + 1;
        let bh = bb.3 - bb.1 + 1;
        let min_dim = bw.min(bh);
        if min_dim < min_thickness {
            continue;
        }
        for y in 0..h {
            for x in 0..w {
                if labels[(y * w + x) as usize] == label_id {
                    out.put_pixel(x, y, image::Luma([255]));
                }
            }
        }
    }
    out
}

/// Connected component labeling using BFS.
/// Returns (label_map, num_labels) where label_map[i] = 0 for background or component ID.
fn connected_components(img: &GrayImage) -> (Vec<u32>, u32) {
    let (w, h) = img.dimensions();
    let size = (w * h) as usize;
    let mut labels = vec![0u32; size];
    let mut current_label = 0u32;

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if img.get_pixel(x, y)[0] > 0 && labels[idx] == 0 {
                current_label += 1;
                let mut queue = std::collections::VecDeque::new();
                queue.push_back((x, y));
                labels[idx] = current_label;

                while let Some((cx, cy)) = queue.pop_front() {
                    for (dx, dy) in &[(0i32, 1i32), (0, -1), (1, 0), (-1, 0)] {
                        let nx = cx as i32 + dx;
                        let ny = cy as i32 + dy;
                        if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                            let nidx = (ny as u32 * w + nx as u32) as usize;
                            if img.get_pixel(nx as u32, ny as u32)[0] > 0 && labels[nidx] == 0 {
                                labels[nidx] = current_label;
                                queue.push_back((nx as u32, ny as u32));
                            }
                        }
                    }
                }
            }
        }
    }

    (labels, current_label)
}

/// Count pixels belonging to a specific connected component.
fn count_pixels(labels: &[u32], _w: u32, _h: u32, label_id: u32) -> u32 {
    labels.iter().filter(|&&l| l == label_id).count() as u32
}

/// Detect the floor plan bounding box via sliding window density analysis.
/// The floor plan has sustained moderate wall density over many rows, while
/// title blocks and legends create short spikes. A sliding window finds the
/// region with the highest cumulative wall content.
///
/// Returns (y_start, y_end, x_start, x_end) bounding box of the floor plan region.
fn detect_floor_plan_region(
    cleaned: &GrayImage,
    w: u32,
    h: u32,
) -> (u32, u32, u32, u32) {
    // --- Vertical extent via sliding window over row densities ---
    let mut row_densities = vec![0.0f64; h as usize];
    for y in 0..h {
        let mut count = 0u32;
        for x in 0..w {
            if cleaned.get_pixel(x, y)[0] > 0 {
                count += 1;
            }
        }
        row_densities[y as usize] = count as f64 / w as f64;
    }

    // Use a sliding window of ~30% of image height.
    // The floor plan typically occupies 50-80% of the image height.
    // This window is large enough to capture sustained density but small enough
    // to exclude the title block + legend at the opposite end.
    let window_size = (h as f64 * 0.30) as usize;
    let window_size = window_size.max(50).min(h as usize - 1);

    // Compute prefix sums for efficient window sum computation
    let mut prefix = vec![0.0f64; h as usize + 1];
    for y in 0..h as usize {
        prefix[y + 1] = prefix[y] + row_densities[y];
    }

    // Find the window with the highest total density
    let mut best_sum = 0.0f64;
    let mut best_start = 0usize;
    for start in 0..=(h as usize - window_size) {
        let sum = prefix[start + window_size] - prefix[start];
        if sum > best_sum {
            best_sum = sum;
            best_start = start;
        }
    }
    let best_end = best_start + window_size - 1;

    // Expand the window to include adjacent rows with non-trivial density.
    // Use a threshold of 5% of the average floor plan row density.
    let avg_density = best_sum / window_size as f64;
    let expand_threshold = avg_density * 0.05;

    let mut y_start = best_start;
    while y_start > 0 && row_densities[y_start - 1] > expand_threshold {
        y_start -= 1;
    }
    let mut y_end = best_end;
    while y_end < (h as usize - 1) && row_densities[y_end + 1] > expand_threshold {
        y_end += 1;
    }

    // Add 5% margin to avoid clipping wall edges
    let margin = (h as f64 * 0.05) as usize;
    let y_start = y_start.saturating_sub(margin).min(h as usize - 1) as u32;
    let y_end = (y_end + margin).min(h as usize - 1) as u32;

    log::info!(
        "Floor plan vertical range: y=[{}, {}] ({} px, {:.0}% of image)",
        y_start,
        y_end,
        y_end - y_start,
        (y_end - y_start) as f64 / h as f64 * 100.0
    );

    if (y_end - y_start) < h / 5 {
        log::warn!(
            "Detected floor plan vertical range is very small ({:.0}% of image height) — may not contain a floor plan",
            (y_end - y_start) as f64 / h as f64 * 100.0
        );
    }

    // --- Horizontal extent via column density within detected vertical range ---
    let range_h = (y_end - y_start + 1) as f64;
    let mut col_densities = vec![0.0f64; w as usize];
    for x in 0..w {
        let mut count = 0u32;
        for y in y_start..=y_end {
            if cleaned.get_pixel(x, y)[0] > 0 {
                count += 1;
            }
        }
        col_densities[x as usize] = count as f64 / range_h;
    }

    // Sliding window for horizontal extent (~30% of image width)
    let window_size_x = (w as f64 * 0.30) as usize;
    let window_size_x = window_size_x.max(50).min(w as usize - 1);

    let mut prefix_x = vec![0.0f64; w as usize + 1];
    for x in 0..w as usize {
        prefix_x[x + 1] = prefix_x[x] + col_densities[x];
    }

    let mut best_sum_x = 0.0f64;
    let mut best_start_x = 0usize;
    for start in 0..=(w as usize - window_size_x) {
        let sum = prefix_x[start + window_size_x] - prefix_x[start];
        if sum > best_sum_x {
            best_sum_x = sum;
            best_start_x = start;
        }
    }
    let best_end_x = best_start_x + window_size_x - 1;

    let avg_density_x = best_sum_x / window_size_x as f64;
    let expand_threshold_x = avg_density_x * 0.05;

    let mut x_start = best_start_x;
    while x_start > 0 && col_densities[x_start - 1] > expand_threshold_x {
        x_start -= 1;
    }
    let mut x_end = best_end_x;
    while x_end < (w as usize - 1) && col_densities[x_end + 1] > expand_threshold_x {
        x_end += 1;
    }

    let margin_x = (w as f64 * 0.05) as usize;
    let x_start = x_start.saturating_sub(margin_x).min(w as usize - 1) as u32;
    let x_end = (x_end + margin_x).min(w as usize - 1) as u32;

    log::info!("Floor plan horizontal range: x=[{}, {}]", x_start, x_end);

    (y_start, y_end, x_start, x_end)
}

/// Morphological close: dilate then erode. Fills small gaps.
fn morph_close(img: &GrayImage, radius: i32) -> GrayImage {
    erode(&dilate(img, radius), radius)
}

/// Binary dilate: expand white pixels by `radius` pixels using a square kernel.
fn dilate(img: &GrayImage, radius: i32) -> GrayImage {
    let (w, h) = img.dimensions();
    let mut out = GrayImage::new(w, h);

    for y in 0..h {
        for x in 0..w {
            let mut max_val = 0u8;
            for dy in -radius..=radius {
                for dx in -radius..=radius {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                        let val = img.get_pixel(nx as u32, ny as u32)[0];
                        if val > max_val {
                            max_val = val;
                        }
                    }
                }
            }
            out.put_pixel(x, y, image::Luma([max_val]));
        }
    }
    out
}

/// Binary erode: shrink white pixels by `radius` pixels using a square kernel.
fn erode(img: &GrayImage, radius: i32) -> GrayImage {
    let (w, h) = img.dimensions();
    let mut out = GrayImage::new(w, h);

    for y in 0..h {
        for x in 0..w {
            let mut min_val = 255u8;
            for dy in -radius..=radius {
                for dx in -radius..=radius {
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx >= 0 && nx < w as i32 && ny >= 0 && ny < h as i32 {
                        let val = img.get_pixel(nx as u32, ny as u32)[0];
                        if val < min_val {
                            min_val = val;
                        }
                    }
                }
            }
            out.put_pixel(x, y, image::Luma([min_val]));
        }
    }
    out
}
