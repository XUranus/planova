---
sidebar_position: 5
title: PlanGraph Construction
---

# PlanGraph Construction

**Module**: `src-tauri/src/pipeline/plan_graph.rs`
**Function**: `build_plan_graph(wall_graph, vlm_response, image_width, image_height) -> PlanGraphJSON`

The PlanGraph stage merges CV wall segments with VLM semantic data into a unified intermediate representation called PlanGraphJSON. This is the central data structure of the hybrid pipeline.

## Data Structure

```rust
pub struct PlanGraphJSON {
    pub wall_segments: Vec<WallSegment>,   // CV-extracted walls
    pub faces: Vec<Face>,                   // Room polygons
    pub labels: Vec<RoomLabel>,             // VLM room labels
    pub doors: Vec<DoorCandidate>,          // VLM doors
    pub windows: Vec<WindowCandidate>,      // VLM windows
    pub scale_candidates: Vec<ScaleCandidate>, // Scale estimates
    pub alignment_scores: Option<AlignmentScores>,
    pub source: String,                     // "hybrid_cv_vlm" or "vlm_only"
}
```

## Wall Segments

CV wall segments are converted directly from the WallGraphResult:

```rust
WallSegment {
    id: seg.id.clone(),           // "cv_wall_1"
    start: seg.start,             // [x, y] in pixels
    end: seg.end,                 // [x, y] in pixels
    thickness_px: 3.0,            // default thickness
    source: "cv_mask".into(),
    confidence: seg.confidence,
}
```

## Room Label Extraction

Labels are extracted from the VLM response's `detected_rooms` array. Supports two formats:

1. **Polygon format** (legacy VLM): room has a `polygon` field, centroid is computed from it
2. **Centroid format** (hybrid VLM): room has a `centroid` field directly

```rust
pub struct RoomLabel {
    pub id: String,           // "label_1"
    pub room_type: String,    // "living_room"
    pub name: String,         // "客厅"
    pub centroid: [f64; 2],   // [x, y] in pixels
    pub confidence: f64,
    pub source: String,       // "vlm"
}
```

## Room Face Generation

Faces are the polygon representations of rooms. The system uses a 3-level fallback strategy:

### Level 1: VLM Polygons (Preferred)

If the VLM response includes `polygon` arrays for rooms, those are used directly as faces. This is the highest quality source.

### Level 2: Wall Grid Topology

If no VLM polygons are available but labels and wall segments exist, the system generates faces from wall positions:

```rust
fn generate_faces_from_walls(labels, wall_segments, image_width, image_height)
```

**Algorithm**:

1. **Collect X coordinates** from vertical walls (segments where `|dx| < |dy|` and length &gt;= 50px)
2. **Collect Y coordinates** from horizontal walls (segments where `|dy| < |dx|` and length &gt;= 50px)
3. **Snap nearby coordinates** within 20px (average them)
4. **Add image bounds** as boundary coordinates
5. **Form grid cells** from the X and Y divider arrays
6. **Assign each cell** to the nearest room centroid (Euclidean distance)
7. **Ensure coverage**: if any label has no cells, reassign the cell nearest to its centroid
8. **Merge cells** per label into one polygon (bounding box of all owned cells)
9. **Clip** to wall bounding box

```
Grid formation example:

    X dividers: [100, 300, 500, 700]
    Y dividers: [50, 250, 450]

    Cells:
    +--------+--------+--------+
    | cell   | cell   | cell   |
    | (0,0)  | (1,0)  | (2,0)  |
    +--------+--------+--------+
    | cell   | cell   | cell   |
    | (0,1)  | (1,1)  | (2,1)  |
    +--------+--------+--------+

    Each cell assigned to nearest room centroid.
```

### Level 3: Centroid Subdivision

If the wall grid fails (too few dividers), falls back to pure centroid-based subdivision:

```rust
fn generate_faces_from_centroids(labels, wall_segments)
```

**Algorithm**:

1. **Cluster centroids by X** coordinate (tolerance 50px)
2. **Sort clusters** left to right
3. **For each cluster**:
   - If single room: spans full height of wall bounding box
   - If multiple rooms: subdivide vertically by Y midpoints between consecutive centroids
4. **Compute X boundaries** as midpoints between cluster centers

```
Centroid subdivision example:

    Labels: A(200,300), B(200,500), C(600,400)

    X clusters: [A,B] at x~200, [C] at x~600

    +----------+----------+
    |          |          |
    |    A     |          |
    |          |    C     |
    +----------+          |
    |          |          |
    |    B     |          |
    |          |          |
    +----------+----------+
```

### Fallback: Single Room from Bounding Box

If all face generation fails but wall segments exist, generates a single rectangular face from the wall bounding box with a 20px margin.

## Opening Binding

Doors and windows from the VLM are snapped to the nearest CV wall segment:

```rust
fn snap_openings_to_walls(doors, windows, wall_segments, labels, max_snap_distance: 120.0)
```

For each opening:
1. Find the nearest point on any wall segment
2. If distance &lt;= 120px, snap the opening position to that point
3. If distance &gt; 120px, downgrade confidence by 50% (capped at 0.3)
4. Filter out invalid room references (room names not in labels)
5. Update `wall_side` for windows based on nearest wall orientation

## Scale Extraction

The system collects multiple scale candidates and selects the one with highest confidence:

```rust
pub struct ScaleCandidate {
    pub meters_per_pixel: f64,
    pub source_text: String,
    pub confidence: f64,
}
```

### Source 1: VLM scale_info (confidence: 0.4-0.8)

From the VLM response's `scale_info.meters_per_pixel`. Confidence is 0.8 if `detected=true` and the resulting dimensions are plausible (0.5-20m per axis), otherwise 0.2-0.4.

### Source 2: Overall Dimensions (confidence: 0.75)

From `overall_dimensions.width_pixels` and `width_meters`. Computes `meters_per_pixel = width_meters / width_pixels`.

### Source 3: Dimension Annotations (confidence: 0.9)

Cross-validates VLM-reported dimension annotations against the CV wall bounding box extent:

```rust
// For each annotation like "3600" (horizontal):
let dim_m = 3600.0 / 1000.0;  // 3.6m
let extent_px = wall_bbox_width;  // e.g., 480px
let mpp = dim_m / extent_px;  // 0.0075
```

Uses the average `meters_per_pixel` across all valid annotations. This is the highest-confidence source because it uses concrete numbers from the floor plan.

### Source 4: CV Wall Extent Fallback (confidence: 0.45)

Assumes the longest wall extent represents a typical residential dimension of ~8 meters:

```rust
let cv_mpp = 8.0 / max_extent_px;
```

Only used if the resulting dimensions are plausible (1-20m per axis).

### Scale Selection

The downstream `convert::convert_plan_graph_to_scene()` function selects the candidate with the highest confidence value.

## Source Field

The `source` field indicates the geometry quality:

- `"hybrid_cv_vlm"` -- 3+ CV wall segments were detected
- `"vlm_only"` -- fewer than 3 CV segments (degraded quality)

## Output Example

```json
{
  "wall_segments": [
    {
      "id": "cv_wall_1",
      "start": [100.0, 50.0],
      "end": [800.0, 50.0],
      "thickness_px": 3.0,
      "source": "cv_mask",
      "confidence": 0.8
    }
  ],
  "faces": [
    {
      "id": "face_1",
      "polygon": [[100.0, 50.0], [450.0, 50.0], [450.0, 400.0], [100.0, 400.0], [100.0, 50.0]],
      "area_px": 122500.0,
      "label_ref": "label_1",
      "source": "wall_grid"
    }
  ],
  "labels": [
    {
      "id": "label_1",
      "room_type": "living_room",
      "name": "客厅",
      "centroid": [275.0, 225.0],
      "confidence": 0.9,
      "source": "vlm"
    }
  ],
  "doors": [
    {
      "id": "door_1",
      "position": [300.0, 50.0],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "kitchen"],
      "swing_direction": "left_inward",
      "confidence": 0.8
    }
  ],
  "windows": [],
  "scale_candidates": [
    {
      "meters_per_pixel": 0.0075,
      "source_text": "dimension_annotations",
      "confidence": 0.9
    }
  ],
  "alignment_scores": null,
  "source": "hybrid_cv_vlm"
}
```

Saved to `data/pipeline/{project_id}/plan_graph.json`.
