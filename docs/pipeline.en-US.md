# Floor Plan AI Parsing Pipeline

## Overview

Planova converts a floor plan image (JPG/PNG) into a walkable 3D interior model. The pipeline has 7 stages:

```
Raw Image → [Preprocess] → [VLM Parse] → [Normalize] → [Repair] → [Validate] → [Overlay] → [Furniture] → [3D Render]
```

All intermediate artifacts are saved to `data/pipeline/{project_id}/` for debugging.

---

## Stage 1: Image Preprocessing

**Module**: `src-tauri/src/pipeline/preprocess.rs`
**Function**: `preprocess_floor_plan(input_path: &str) -> Result<String, String>`

### Steps

1. **Rotation correction** — Canny edge detection + Hough line detection to find dominant line angles; corrects tilts within ±5°
2. **Border cropping** — Binary threshold + dilation to find content area; crops white borders with 20px padding
3. **Size limiting** — Scales down if the longest edge exceeds 2048px

### Input

Raw floor plan image:

```
data/uploads/project_abc/floorplan.jpg   (3000x2000, 2.5MB)
```

### Output

Preprocessed temporary file:

```
/tmp/planova_processed_xxx.jpg           (1800x1200, ~800KB)
```

Also copied to `data/pipeline/{project_id}/preprocessed.jpg`.

---

## Stage 2: VLM Multimodal Parsing

**Module**: `src-tauri/src/ai/client.rs`
**Function**: `call_vlm(image_path: &str, config: &LLMConfig, data_dir: &Path) -> Result<Value, String>`

### Steps

1. Base64-encode the preprocessed image
2. Construct an OpenAI-compatible Vision API request (system prompt + image)
3. Call a multimodal LLM (configurable: `mimo-v2.5`, `mimo-v2-pro`, etc.)
4. Extract JSON from model response (handles markdown code fences, reasoning model `reasoning_content`, etc.)

### System Prompt Key Instructions

```
Geometry Rules:
- Polygon coordinates MUST be in IMAGE PIXELS (not meters)
- Trace room boundaries from ACTUAL WALL LINES — do NOT generate generic rectangles
- Each room polygon MUST be closed (last coordinate equals first coordinate)
- Wall lines MUST be horizontal or vertical — never diagonal
- When two rooms share a wall, shared edge coordinates MUST be identical
- Room polygons MUST NOT overlap

Semantic Rules:
- Chinese labels: 客厅=living_room, 卧室=bedroom, 厨房=kitchen, 卫生间=bathroom...
- Find dimension markers (numbers like 1800, 3600 in mm) to determine scale
- Doors are arc+line symbols; windows are parallel lines in walls

Wall-Room Relationships:
- Each wall must have a "room_refs" array listing which rooms it borders
- Interior walls connect exactly 2 rooms
- Exterior walls connect exactly 1 room

Confidence Calibration:
- >= 0.8: wall lines and room boundaries clearly visible
- 0.5-0.8: boundaries partially visible or ambiguous
- < 0.5: guessing — mark low confidence when uncertain
```

### Input

Preprocessed floor plan image + text instructions.

### Output (Raw VLM JSON)

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "polygon": [[120, 200], [580, 200], [580, 520], [120, 520], [120, 200]],
      "confidence": 0.92
    }
  ],
  "detected_walls": [
    {"start": [120, 0], "end": [900, 0], "room_refs": ["room_1"], "confidence": 0.95}
  ],
  "detected_doors": [
    {
      "position": [250, 200],
      "width_meters": 0.9,
      "connected_rooms": ["kitchen", "living_room"],
      "swing_direction": "left_inward",
      "confidence": 0.80
    }
  ],
  "detected_windows": [
    {
      "position": [120, 100],
      "width_meters": 1.2,
      "wall_side": "west",
      "confidence": 0.85
    }
  ],
  "scale_info": {
    "detected": true,
    "meters_per_pixel": 0.00833
  },
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

**Note**: All coordinates are in **pixels**. `scale_info` provides the pixel-to-meter conversion ratio.

Saved to `data/pipeline/{project_id}/vlm_response.json`.

---

## Stage 3: Data Normalization

**Module**: `src-tauri/src/pipeline/normalizer.rs`
**Function**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> Value`

### Steps

1. **Coordinate conversion** — Pixel coords × `meters_per_pixel` → meter coords
2. **Wall generation** — If VLM didn't return walls, auto-generate from room polygon edges
3. **Opening binding** — Calculate distance from doors/windows to nearest wall, bind `wall_ref`
4. **Material generation** — Generate PBR materials per room type based on style (`modern_luxury`/`cream`/`nordic` etc.)
5. **Camera presets** — Generate overview camera + per-room interior cameras
6. **Light generation** — One light per room (area lights for living room/bedroom, point lights for others)

### Output (HomeSceneJSON)

Normalized scene JSON with all coordinates in meters. Saved to `data/pipeline/{project_id}/scene_normalized.json`.

---

## Stage 4: Geometry Repair

**Module**: `src-tauri/src/pipeline/repair.rs`
**Function**: `repair_scene(scene: &mut Value) -> Vec<String>`

Runs after normalization and before validation. Automatically fixes geometry issues in VLM output. Returns a list of repair actions taken.

### Repair Operations

#### Room Polygon Repairs

| Operation | Description | Threshold |
|-----------|-------------|-----------|
| Vertex snapping | Snap nearby vertices to shared coordinates | 5cm |
| Orthogonalization | Align near-horizontal/vertical edges to exact H/V | 10° |
| Closure repair | Append first point if polygon is unclosed | 1mm |
| Degenerate removal | Remove rooms with too-small area | 0.5 m² |
| Overlap detection | Detect and flag room polygon overlaps | 50% vertex containment |

#### Wall Repairs

| Operation | Description | Threshold |
|-----------|-------------|-----------|
| Endpoint snapping | Snap nearby wall endpoints to shared coordinates | 5cm |
| Collinear merging | Merge collinear and nearby wall segments | angle < 5°, dist < 10cm |
| room_refs repair | Fix room_refs based on wall-polygon edge matching | midpoint dist < 30cm |

#### Opening Repairs

| Operation | Description | Threshold |
|-----------|-------------|-----------|
| Rebinding | Rebind openings to nearest wall | wall_thickness × 2 |

### Output

Repair action log, e.g.:

```
snapped 18 polygon vertex/vertices to nearby points
orthogonalized 3 room polygon(s)
closed 1 unclosed polygon(s)
snapped 6 wall endpoint(s)
merged 2 collinear wall segment(s)
fixed room_refs for 4 wall(s)
rebound 1 opening(s) to closer wall
```

Saved to `data/pipeline/{project_id}/repair_log.json`.

---

## Stage 5: Quality Validation

**Module**: `src-tauri/src/pipeline/validate.rs`
**Function**: `validate_scene(scene: &Value, repair_actions: &[String]) -> ValidationReport`

Performs comprehensive validation on the repaired scene and generates a quality report.

### Validation Rules

#### Room Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Polygon points >= 3 | Error | Degenerate polygon |
| Polygon closed | Error | First-last point distance > 1cm |
| Area >= 0.5 m² | Error | Room too small |
| No NaN/Inf coordinates | Error | Invalid coordinates |
| Aspect ratio <= 20:1 | Warning | Extreme aspect ratio |
| No self-intersection | Warning | Polygon may self-intersect |
| Bedroom area >= 3 m² | Warning | Bedroom too small |
| Bathroom area <= 30 m² | Warning | Unusually large bathroom |

#### Wall Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Length >= 5cm | Warning | Wall segment too short |
| room_refs non-empty | Warning | Orphan wall |

#### Opening Checks

| Rule | Severity | Description |
|------|----------|-------------|
| wall_ref exists | Error | Unbound opening |
| Door width 0.5–2.0m | Warning | Unusual door width |
| Window width 0.2–4.0m | Warning | Unusual window width |

#### Scale Checks

| Rule | Severity | Description |
|------|----------|-------------|
| Total extent 2–50m | Warning | Scale may be wrong |

### Score Calculation

```
score = 1.0 - (error_count × 0.15 + warning_count × 0.05)
```

Score is clamped to [0, 1].

### Sub-scores

| Sub-score | Calculation |
|-----------|-------------|
| geometry_score | Heuristic based on room/wall/opening counts |
| semantic_score | Based on room naming and type annotation completeness |
| scale_score | Based on room areas being within reasonable ranges |

### Output (ValidationReport)

```json
{
  "valid": true,
  "score": 0.85,
  "errors": [],
  "warnings": [
    {
      "type": "small_bedroom",
      "message": "Bedroom '次卧' is only 2.8 m²",
      "ids": ["room_3"]
    }
  ],
  "repair_actions": [
    "snapped 18 polygon vertex/vertices to nearby points",
    "closed 1 unclosed polygon(s)"
  ],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "needs_user_review": false
  }
}
```

Saved to `data/pipeline/{project_id}/validation_report.json`.

### parse_quality Injection

After validation, `parse_quality` is injected into HomeSceneJSON for frontend access:

```json
{
  "rooms": [...],
  "walls": [...],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "needs_user_review": false
  }
}
```

---

## Stage 6: Debug Overlay

**Module**: `src-tauri/src/pipeline/overlay.rs`
**Function**: `generate_overlay(processed_path: &str, raw_vlm: &Value, pipeline_dir: &Path) -> Result<(), String>`

Draws VLM parsing results back onto the preprocessed image for visual debugging.

### Drawn Elements

| Element | Style |
|---------|-------|
| Room polygons | Colored outlines (different color per room type) |
| Room labels | Room name at centroid position |
| Wall endpoints | Small red circles |
| Doors | Green markers with "D" label |
| Windows | Blue markers with "W" label |

### Color Mapping

| Room Type | Color |
|-----------|-------|
| living_room | Red |
| bedroom | Blue |
| kitchen | Green |
| bathroom | Orange |
| dining_room | Purple |
| balcony | Yellow |
| corridor | Gray |
| study | Teal |

### Output

Saved to `data/pipeline/{project_id}/overlay_debug.png`.

---

## Stage 7: Furniture Planning

**Module**: `src-tauri/src/pipeline/furniture.rs`
**Function**: `plan_furniture(scene: &Value, data_dir: &Path) -> Result<Value, String>`

Uses an LLM to plan furniture placement based on room type, area, and door/window positions.

### Available Categories

sofa, coffee_table, tv_stand, bed_double, bed_single, nightstand, wardrobe, dining_table, dining_chair, desk, bookshelf, bathroom_sink, toilet, shower, kitchen_counter, fridge

### Rules

- Choose appropriate furniture for each room type
- Adjust quantity based on room area (< 8m² minimal, 8-15m² standard, > 15m² can add more)
- Furniture positions must be within room polygons
- Never block doorways (0.8m clearance from door positions)
- Never place furniture in front of windows

---

## Stage 8: 3D Rendering

**Module**: `src/engine/buildScene.ts`
**Function**: `buildScene(scene: HomeSceneJSON) -> BuiltScene`

### Steps

1. **Build floors** (`buildFloors.ts`) — Each room's `polygon` → `BoxGeometry` slab (0.04m thick), material from `room.floor_material`
2. **Build walls** (`buildWalls.ts`) — Each wall's `start`/`end` + `height`/`thickness` → `BoxGeometry`, with door/window cutouts
3. **Build ceilings** (`buildCeilings.ts`) — Each room → thin slab at `ceiling_height`
4. **Build openings** (`buildOpenings.ts`) — Door frames + door panels + window frames + glass
5. **Build furniture** (`buildObjects.ts` + `furnitureModels.ts`) — If `objects` is empty, auto-layout furniture by room type; each category composed of multiple primitives (box + cylinder + sphere)

### Output

Three.js scene, added to `<Canvas>` via `scene.add(builtScene.group)`.

---

## Debug Artifacts

Each parse run generates the following files in `data/pipeline/{project_id}/`:

| File | Description |
|------|-------------|
| `preprocessed.jpg` | Preprocessed image |
| `vlm_response.json` | Raw VLM response JSON |
| `scene_normalized.json` | Normalized HomeSceneJSON |
| `repair_log.json` | Geometry repair action log |
| `validation_report.json` | Quality validation report |
| `overlay_debug.png` | VLM parsing result overlay image |
| `meta.json` | Pipeline metadata (statistics, validation score) |

### meta.json Example

```json
{
  "project_id": "proj_abc123",
  "vlm_stats": {
    "rooms": 4,
    "walls": 7,
    "doors": 2,
    "windows": 2
  },
  "scene_stats": {
    "rooms": 4,
    "walls": 7,
    "objects": 12,
    "materials": 6
  },
  "validation": {
    "score": 0.85,
    "error_count": 0,
    "warning_count": 1,
    "repair_action_count": 3,
    "needs_user_review": false
  }
}
```

---

## Data Flow Summary

```
┌─────────────────┐
│  Raw Floor Plan  │  JPG/PNG, ~2-5MB
│  (pixel coords)  │
└────────┬────────┘
         │ preprocess()
         ▼
┌─────────────────┐
│  Preprocessed    │  Cropped + rotation corrected + resized
│  (pixel coords)  │  ~1800x1200
└────────┬────────┘
         │ call_vlm()
         ▼
┌─────────────────┐
│  VLM Raw JSON    │  Room/wall/door/window pixel coordinates
│  (pixel coords)  │  + scale_info (meters_per_pixel)
└────────┬────────┘
         │ normalize_scene()
         ▼
┌─────────────────┐
│  HomeSceneJSON   │  Meter coordinates + materials + lights + cameras
│  (meter coords)  │
└────────┬────────┘
         │ repair_scene()
         ▼
┌─────────────────┐
│  Repaired Scene  │  Snapped vertices, orthogonalized, closed, merged
│  (meter coords)  │  + repair_log.json
└────────┬────────┘
         │ validate_scene()
         ▼
┌─────────────────┐
│  Validation      │  score, errors, warnings
│  Report          │  + parse_quality injected into scene
└────────┬────────┘
         │ generate_overlay()
         ▼
┌─────────────────┐
│  Debug Overlay   │  overlay_debug.png
│                  │  Visual room/wall/door/window rendering
└────────┬────────┘
         │ plan_furniture()
         ▼
┌─────────────────┐
│  Scene with      │  LLM-planned furniture layout
│  Furniture       │
└────────┬────────┘
         │ buildScene()
         ▼
┌─────────────────┐
│  THREE.Group     │  Interactive 3D model
│  (3D render)     │  Supports walk/edit/export
└─────────────────┘
```

---

## Frontend Integration

### parse_quality Display

The `parse_quality` field in HomeSceneJSON is displayed in the `SceneInspector` component:

- **Score progress bar** — Color-coded: green (>= 80%), yellow (>= 50%), red (< 50%)
- **Status icon** — Green checkmark (OK) or yellow warning triangle (needs review)
- **Sub-scores** — Geometry, semantic, and scale dimension scores

When `needs_user_review` is `true`, users are prompted to review the parsing results.
