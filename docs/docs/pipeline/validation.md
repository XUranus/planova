---
sidebar_position: 8
title: Quality Validation
---

# Quality Validation

**Module**: `src-tauri/src/pipeline/validate.rs`
**Functions**: `validate_scene()`, `validate_scene_with_alignment()`

The validation stage performs comprehensive quality checks on the repaired scene and generates a validation report with scores, errors, and warnings.

## Validation Checks

### Room Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Polygon points &gt;= 3 | Error | Degenerate polygon |
| Polygon closed | Error | First-last point distance &gt; 1cm |
| No NaN/Inf coordinates | Error | Invalid coordinate values |
| Area &gt;= 0.5 m^2 | Error | Room too small |
| Aspect ratio &lt;= 20:1 | Warning | Extreme aspect ratio |
| No self-intersection | Warning | Polygon edges may cross |
| Bedroom area &gt;= 3 m^2 | Warning | Bedroom too small |
| Bathroom area &lt;= 30 m^2 | Warning | Unusually large bathroom |

### Wall Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Length &gt;= 5cm | Warning | Wall segment too short |
| room_refs non-empty | Warning | Orphan wall (not linked to any room) |

### Opening Checks

| Rule | Severity | Description |
|------|----------|-------------|
| wall_ref exists | Error | Opening not bound to any wall |
| wall_ref is valid | Error | References non-existent wall |
| Door width 0.5-2.0m | Warning | Unusual door width |
| Window width 0.2-4.0m | Warning | Unusual window width |

### Scale Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Total extent &gt;= 2m | Warning | Scale may be wrong (too small) |
| Total extent &lt;= 50m | Warning | Scale may be wrong (too large) |

## Score Calculation

### Overall Score

```rust
let score = (1.0 - error_count * 0.15 - warning_count * 0.05).max(0.0).min(1.0);
```

Each error reduces the score by 0.15, each warning by 0.05. Clamped to [0, 1].

### Sub-scores

#### geometry_score

Heuristic based on room/wall/opening counts:

```rust
fn compute_geometry_score(scene) -> f64 {
    let mut score = 0.5;           // base for having rooms
    if walls > 0 { score += 0.2; }
    if openings > 0 { score += 0.15; }
    if walls >= rooms { score += 0.15; }
    score.min(1.0)
}
```

| Component | Points |
|-----------|--------|
| Has rooms | 0.5 |
| Has walls | +0.2 |
| Has openings | +0.15 |
| Walls &gt;= rooms | +0.15 |

#### semantic_score

Based on room naming and type annotation completeness:

```rust
fn compute_semantic_score(scene) -> f64 {
    let name_ratio = named_rooms / total_rooms;
    let type_ratio = typed_rooms / total_rooms;
    (name_ratio * 0.5 + type_ratio * 0.5).min(1.0)
}
```

- `named_rooms`: rooms whose name does not start with "Room "
- `typed_rooms`: rooms whose type is not the default "living_room"

#### scale_score

Based on room areas being within reasonable ranges:

```rust
fn compute_scale_score(scene) -> f64 {
    // Rooms with area 1-100 m^2 are "reasonable"
    reasonable_count / total_rooms_with_area
}
```

#### image_alignment_score

In hybrid mode, the alignment score from the `alignment.rs` module. In legacy mode, defaults to 1.0.

## Image Alignment (Hybrid Pipeline)

**Module**: `src-tauri/src/pipeline/alignment.rs`
**Function**: `compute_alignment(wall_mask_path, plan_graph, image_width, image_height, pipeline_dir)`

Compares the CV wall mask against the rendered PlanGraph geometry using BFS-based distance transforms.

### Algorithm

1. **Render thin segments**: draw PlanGraph wall segments and face polygon edges as 1px lines
2. **BFS distance from segments**: compute distance from each pixel to the nearest segment pixel
3. **BFS distance from mask**: compute distance from each pixel to the nearest mask pixel
4. **Tolerance**: 5 pixels (half of typical wall width)

### Metrics

| Metric | Definition | Formula |
|--------|------------|---------|
| wall_recall | Fraction of mask pixels covered by segments | `mask_covered / mask_count` |
| wall_precision | Fraction of segment pixels covered by mask | `seg_valid / seg_count` |
| wall_iou | Intersection over union | `both_covered / either_covered` |
| overall | Weighted combination | `0.3 * precision + 0.5 * recall + 0.2 * iou` |

Recall is weighted highest (0.5) because missing walls are worse than extra walls.

### Alignment Report

```rust
pub struct AlignmentScores {
    pub wall_iou: f64,
    pub wall_precision: f64,
    pub wall_recall: f64,
    pub overall: f64,
}
```

## Review Gate

The `needs_user_review` flag is set when:

```rust
let needs_user_review = error_count > 0.0 || image_alignment_score < 0.75;
```

Note: warnings alone do NOT trigger review if alignment is good. This prevents false positives from centroid-subdivision artifacts (orphan walls).

### Hybrid Pipeline Quality Gate

In the hybrid pipeline, furniture planning is gated on quality:

```rust
let should_plan_furniture = pq.geometry_score >= 0.8
    && pq.scale_score >= 0.9
    && pq.image_alignment_score >= 0.75
    && !pq.needs_user_review;
```

If any condition fails, furniture planning is skipped to avoid placing furniture in incorrectly parsed rooms.

## Validation Report Output

```json
{
  "valid": true,
  "score": 0.85,
  "errors": [],
  "warnings": [
    {
      "type": "small_bedroom",
      "message": "Bedroom '次卧' is only 2.8 m^2",
      "ids": ["room_3"]
    }
  ],
  "repair_actions": [
    "snapped 18 polygon vertex/vertices to nearby points",
    "closed 1 unclosed polygon(s)"
  ],
  "parse_quality": {
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "image_alignment_score": 0.82,
    "needs_user_review": false
  },
  "image_alignment": {
    "wall_iou": 0.71,
    "wall_precision": 0.88,
    "wall_recall": 0.76,
    "overall": 0.82
  }
}
```

The `image_alignment` field is only present in hybrid mode.

## Frontend Integration

After validation, `parse_quality` is injected into the HomeSceneJSON:

```json
{
  "rooms": [...],
  "walls": [...],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "image_alignment_score": 0.82,
    "needs_user_review": false,
    "image_alignment": {
      "wall_iou": 0.71,
      "wall_precision": 0.88,
      "wall_recall": 0.76,
      "overall": 0.82
    }
  }
}
```

The frontend `SceneInspector` component displays:
- **Score progress bar** -- color-coded: green (&gt;= 80%), yellow (&gt;= 50%), red (&lt; 50%)
- **Status icon** -- green checkmark or yellow warning triangle
- **Sub-scores** -- geometry, semantic, scale, alignment
- **Alignment overlay** -- visual comparison of CV mask vs PlanGraph geometry

## Debug Artifacts

| File | Description |
|------|-------------|
| `validation_report.json` | Full validation report |
| `rendered_structure_mask.png` | PlanGraph geometry rendered as binary mask |
| `overlay_alignment.png` | Color-coded alignment visualization (green=matched, red=missing, blue=extra) |
