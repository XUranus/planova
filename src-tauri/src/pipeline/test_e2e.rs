//! End-to-end test for the hybrid pipeline modules.
//! Run with: cargo test --lib test_pipeline_e2e -- --nocapture

#[cfg(test)]
mod tests {
    use super::super::*;
    use std::path::Path;

    const TEST_IMAGE: &str = "/home/xuranus/workspace/planova/assets/plane-design-3.png";

    #[test]
    fn test_wall_mask_extraction() {
        let pipeline_dir = Path::new("/tmp/planova_test");
        std::fs::create_dir_all(pipeline_dir).unwrap();

        // Preprocess
        let processed = preprocess::preprocess_floor_plan(TEST_IMAGE).unwrap();
        println!("Preprocessed: {}", processed);

        // Extract wall mask
        let mask_path = wall_mask::extract_wall_mask(&processed, pipeline_dir).unwrap();
        println!("Wall mask: {}", mask_path);

        // Check the mask
        let mask = image::open(&mask_path).unwrap().to_luma8();
        let (w, h) = mask.dimensions();
        let wall_pixels = mask.pixels().filter(|p| p[0] > 0).count();
        let ratio = wall_pixels as f64 / (w * h) as f64;
        println!("Mask: {}x{}, {} wall pixels ({:.1}%)", w, h, wall_pixels, ratio * 100.0);

        // Wall ratio should be reasonable: 1-20%
        assert!(ratio > 0.005, "Wall ratio too low: {:.2}%", ratio * 100.0);
        assert!(ratio < 0.20, "Wall ratio too high: {:.1}%", ratio * 100.0);

        // Verify no wall pixels in title block (top) or legend (bottom) regions
        let mut top_wall_pixels = 0u32;
        for y in 0..150 {
            for x in 0..w {
                if mask.get_pixel(x, y)[0] > 0 { top_wall_pixels += 1; }
            }
        }
        let mut bottom_wall_pixels = 0u32;
        for y in 900..h {
            for x in 0..w {
                if mask.get_pixel(x, y)[0] > 0 { bottom_wall_pixels += 1; }
            }
        }
        println!("Top region (y<150) wall pixels: {}", top_wall_pixels);
        println!("Bottom region (y>900) wall pixels: {}", bottom_wall_pixels);
        assert!(top_wall_pixels < 500, "Too many wall pixels in title block region: {}", top_wall_pixels);
        assert!(bottom_wall_pixels < 500, "Too many wall pixels in legend region: {}", bottom_wall_pixels);
    }

    #[test]
    fn test_wall_graph_segments() {
        let pipeline_dir = Path::new("/tmp/planova_test");
        std::fs::create_dir_all(pipeline_dir).unwrap();

        let processed = preprocess::preprocess_floor_plan(TEST_IMAGE).unwrap();
        let mask_path = wall_mask::extract_wall_mask(&processed, pipeline_dir).unwrap();
        let graph = wall_graph::build_wall_graph(&mask_path, pipeline_dir).unwrap();

        println!("Wall graph: {} segments, {} junctions", graph.segments.len(), graph.junction_points.len());

        // Print segments for analysis
        for seg in &graph.segments {
            let len = ((seg.end[0] - seg.start[0]).powi(2) + (seg.end[1] - seg.start[1]).powi(2)).sqrt();
            println!("  {} ({}) [{:.0},{:.0}] -> [{:.0},{:.0}] len={:.0}",
                seg.id, seg.orientation, seg.start[0], seg.start[1], seg.end[0], seg.end[1], len);
        }

        // Should have reasonable number of segments (not 34 spanning lines)
        assert!(graph.segments.len() >= 3, "Too few segments: {}", graph.segments.len());
        assert!(graph.segments.len() <= 80, "Too many segments: {}", graph.segments.len());

        // No segment should span the full image width/height
        let img_w = 1370.0;
        let img_h = 1041.0;
        for seg in &graph.segments {
            let len = ((seg.end[0] - seg.start[0]).powi(2) + (seg.end[1] - seg.start[1]).powi(2)).sqrt();
            if seg.orientation == "horizontal" {
                assert!(len < img_w * 0.95, "Segment {} spans full image width: {:.0}", seg.id, len);
            } else {
                assert!(len < img_h * 0.95, "Segment {} spans full image height: {:.0}", seg.id, len);
            }
        }

        // No segments should be in the title block (top y<150) or legend (bottom y>900) regions
        for seg in &graph.segments {
            let mid_y = (seg.start[1] + seg.end[1]) / 2.0;
            assert!(mid_y > 150.0, "Segment {} is in title block region (y={:.0})", seg.id, mid_y);
            assert!(mid_y < 900.0, "Segment {} is in legend/title region (y={:.0})", seg.id, mid_y);
        }
    }

    #[test]
    fn test_full_pipeline_with_mock_vlm() {
        let pipeline_dir = Path::new("/tmp/planova_test_full");
        std::fs::create_dir_all(pipeline_dir).unwrap();

        let processed = preprocess::preprocess_floor_plan(TEST_IMAGE).unwrap();
        let img_dims = image::image_dimensions(&processed).unwrap();
        let (img_w, img_h) = img_dims;
        println!("Image: {}x{}", img_w, img_h);

        let mask_path = wall_mask::extract_wall_mask(&processed, pipeline_dir).unwrap();
        let wall_graph = wall_graph::build_wall_graph(&mask_path, pipeline_dir).unwrap();

        // Mock VLM response (same as real one)
        let vlm_response = serde_json::json!({
            "detected_rooms": [
                {"type": "living_room", "name": "客厅", "centroid": [225, 300], "confidence": 0.9},
                {"type": "bedroom", "name": "卧室", "centroid": [645, 420], "confidence": 0.9},
                {"type": "bathroom", "name": "卫生间", "centroid": [645, 120], "confidence": 0.9}
            ],
            "detected_doors": [
                {"position": [450, 420], "width_meters": 0.9, "connected_rooms": ["living_room", "bedroom"], "swing_direction": "right_inward", "confidence": 0.8},
                {"position": [450, 120], "width_meters": 0.9, "connected_rooms": ["living_room", "bathroom"], "swing_direction": "right_inward", "confidence": 0.8}
            ],
            "detected_windows": [
                {"position": [150, 600], "width_meters": 1.2, "wall_side": "north", "confidence": 0.7},
                {"position": [300, 600], "width_meters": 1.2, "wall_side": "north", "confidence": 0.7}
            ],
            "scale_info": {"detected": true, "meters_per_pixel": 0.01}
        });

        let pg = plan_graph::build_plan_graph(&wall_graph, &vlm_response, img_w, img_h);
        println!("\nPlanGraph:");
        println!("  {} wall segments", pg.wall_segments.len());
        println!("  {} faces", pg.faces.len());
        for face in &pg.faces {
            println!("    {} area={:.0} source={} label_ref={:?}", face.id, face.area_px, face.source, face.label_ref);
        }
        println!("  {} labels", pg.labels.len());
        for label in &pg.labels {
            println!("    {} type={} name={} centroid=[{:.0},{:.0}]", label.id, label.room_type, label.name, label.centroid[0], label.centroid[1]);
        }

        // Convert to scene
        let mut scene = convert::convert_plan_graph_to_scene(&pg, "modern_luxury", 2.8, 0.2, "Test", "test");

        // Run repair
        let repair_actions = repair::repair_scene(&mut scene);
        println!("Repair: {} actions", repair_actions.len());

        let rooms = scene.get("rooms").and_then(|v| v.as_array()).unwrap();
        let walls = scene.get("walls").and_then(|v| v.as_array()).unwrap();
        println!("\nScene: {} rooms, {} walls", rooms.len(), walls.len());

        for room in rooms {
            let name = room.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let area = room.get("area").and_then(|v| v.as_f64()).unwrap_or(0.0);
            println!("  Room '{}': {:.1} m²", name, area);
        }

        // Count walls with room_refs
        let walls_with_refs = walls.iter().filter(|w| {
            w.get("room_refs").and_then(|v| v.as_array()).map(|a| !a.is_empty()).unwrap_or(false)
        }).count();
        println!("\nWalls with room_refs: {}/{}", walls_with_refs, walls.len());

        // Compute alignment
        let alignment = alignment::compute_alignment(&mask_path, &pg, img_w, img_h, pipeline_dir);
        println!("\nAlignment: IoU={:.3} Precision={:.3} Recall={:.3} Overall={:.3}",
            alignment.wall_iou, alignment.wall_precision, alignment.wall_recall, alignment.overall);

        // Run validation
        let report = validate::validate_scene_with_alignment(&scene, &repair_actions, Some(&alignment));
        println!("\nValidation:");
        println!("  score: {:.2}", report.score);
        println!("  geometry_score: {:.2}", report.parse_quality.geometry_score);
        println!("  semantic_score: {:.2}", report.parse_quality.semantic_score);
        println!("  scale_score: {:.2}", report.parse_quality.scale_score);
        println!("  image_alignment_score: {:.2}", report.parse_quality.image_alignment_score);
        println!("  needs_user_review: {}", report.parse_quality.needs_user_review);
        println!("  errors: {}", report.errors.len());
        println!("  warnings: {}", report.warnings.len());

        // Asserts
        assert!(pg.faces.len() >= 2, "Should have at least 2 faces, got {}", pg.faces.len());
        assert!(rooms.len() >= 2, "Should have at least 2 rooms, got {}", rooms.len());
        assert!(alignment.overall > 0.3, "Alignment overall too low: {:.3}", alignment.overall);
        assert!(walls_with_refs > 0, "No walls have room_refs!");

        // Scale validation: no room should exceed 30m in any dimension
        for room in rooms {
            let name = room.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let area = room.get("area").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let max_dim = area.sqrt();
            assert!(max_dim < 30.0, "Room '{}' too large: {:.1}m² (max_dim={:.1}m)", name, area, max_dim);
        }
    }
}
