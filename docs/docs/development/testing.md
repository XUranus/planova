---
sidebar_position: 2
title: Testing
description: End-to-end pipeline tests and how to run them
---

# Testing

Planova's pipeline has end-to-end tests that exercise the full floor-plan-to-scene conversion flow using a real floor plan image and a mock VLM response.

## Test File

All pipeline E2E tests live in:

```
src-tauri/src/pipeline/test_e2e.rs
```

## Running Tests

From the `src-tauri/` directory:

```bash
cd src-tauri
cargo test --lib test_pipeline_e2e -- --nocapture
```

The `--nocapture` flag prints detailed diagnostic output (room areas, alignment scores, segment counts) to stdout during the run.

To run all library tests:

```bash
cargo test --lib
```

## Test Cases

### 1. `test_wall_mask_extraction`

Tests the wall mask extraction step in isolation.

**What it does:**

1. Preprocesses the test image (`assets/plane-design-3.png`).
2. Extracts a binary wall mask via `wall_mask::extract_wall_mask`.
3. Computes the ratio of wall pixels to total image pixels.

**Assertions:**

| Check | Condition |
|-------|-----------|
| Wall pixel ratio | Between 0.5% and 20% |
| Title block region (y < 150) | Fewer than 500 wall pixels |
| Legend region (y > 900) | Fewer than 500 wall pixels |

These checks verify that the mask correctly identifies structural walls while ignoring annotations, title blocks, and legends.

### 2. `test_wall_graph_segments`

Tests wall skeleton graph construction from the wall mask.

**What it does:**

1. Runs preprocessing and wall mask extraction.
2. Builds the wall skeleton graph via `wall_graph::build_wall_graph`.
3. Inspects the resulting segments and junctions.

**Assertions:**

| Check | Condition |
|-------|-----------|
| Segment count | Between 3 and 80 |
| No full-span segments | No horizontal segment exceeds 95% of image width; no vertical segment exceeds 95% of image height |
| No title-block segments | No segment midpoint with y < 150 |
| No legend segments | No segment midpoint with y > 900 |

### 3. `test_full_pipeline_with_mock_vlm`

Tests the complete pipeline from preprocessing through scene validation.

**What it does:**

1. Preprocesses the image and extracts wall mask and wall graph.
2. Constructs a **mock VLM response** (see below).
3. Builds the `PlanGraph` from wall segments + VLM response.
4. Converts `PlanGraph` to a `HomeSceneJSON` scene.
5. Runs scene repair (`repair::repair_scene`).
6. Computes wall alignment metrics (`alignment::compute_alignment`).
7. Validates the final scene (`validate::validate_scene_with_alignment`).

**Assertions:**

| Check | Condition |
|-------|-----------|
| Face count | At least 2 faces |
| Room count | At least 2 rooms |
| Alignment overall score | Greater than 0.5 |
| Walls with `room_refs` | At least 1 |
| Scale mpp (best candidate) | Between 0.005 and 0.015 |
| Per-room max dimension | Less than 15 m |
| Total area | Between 20 m² and 100 m² |

## Mock VLM Response Structure

The mock response simulates what the VLM returns when given a floor plan image:

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "centroid": [300, 500],
      "confidence": 0.9
    },
    {
      "type": "bedroom",
      "name": "卧室",
      "centroid": [900, 400],
      "confidence": 0.9
    },
    {
      "type": "bathroom",
      "name": "卫生间",
      "centroid": [900, 700],
      "confidence": 0.9
    }
  ],
  "detected_doors": [
    {
      "position": [700, 400],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "bedroom"],
      "swing_direction": "right_inward",
      "confidence": 0.8
    },
    {
      "position": [700, 700],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "bathroom"],
      "swing_direction": "right_inward",
      "confidence": 0.8
    }
  ],
  "detected_windows": [
    {
      "position": [300, 200],
      "width_meters": 1.2,
      "wall_side": "north",
      "confidence": 0.7
    },
    {
      "position": [900, 200],
      "width_meters": 1.2,
      "wall_side": "north",
      "confidence": 0.7
    }
  ],
  "scale_info": {
    "detected": true,
    "meters_per_pixel": 0.01
  },
  "dimension_annotations": [
    { "text": "8400", "position": [600, 100], "direction": "horizontal" },
    { "text": "6000", "position": [100, 500], "direction": "vertical" }
  ]
}
```

**Key fields:**

- `detected_rooms` -- Room labels with centroid pixel positions and type.
- `detected_doors` -- Door positions, widths in meters, connected rooms, and swing direction.
- `detected_windows` -- Window positions, widths, and wall side.
- `scale_info` -- Initial scale estimate (meters per pixel).
- `dimension_annotations` -- OCR-detected dimension labels from the floor plan image (values in millimeters).

## Test Artifacts

All test outputs are saved to `/tmp/planova_test/` (or `/tmp/planova_test_full/` for the full pipeline test). This directory includes:

- `preprocessed.png` -- Preprocessed floor plan image
- `wall_mask.png` -- Binary wall mask
- `wall_graph.json` -- Wall skeleton graph data
- `overlay_alignment.png` -- Alignment overlay visualization

The directory is created automatically before each test run.
