---
sidebar_position: 6
title: Data Normalization
---

# Data Normalization

**Module**: `src-tauri/src/pipeline/normalizer.rs`
**Function**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> Value`

The normalization stage converts the raw VLM output (pixel coordinates) into a fully-specified HomeSceneJSON (meter coordinates) with materials, cameras, and lights. In the legacy pipeline, this is the primary conversion step. In the hybrid pipeline, the `convert.rs` module handles the pixel-to-meter conversion instead, but both share the normalizer's material, camera, and light generation functions.

## Processing Steps

### 1. Scale Determination

Extracts `meters_per_pixel` from the VLM response:

```rust
let meters_per_pixel = scale_info
    .get("meters_per_pixel")
    .and_then(|v| v.as_f64())
    .unwrap_or(0.02);  // default fallback
```

If `scale_info.detected` is false, estimates scale from `overall_dimensions` by comparing the pixel bounding box of all room polygons to the reported meter dimensions:

```rust
fn estimate_scale_from_bbox(rooms, overall) -> f64 {
    // pixel_width from room polygon bounds
    // real_width from overall_dimensions.width_meters
    meters_per_pixel = real_width / pixel_width
}
```

### 2. Room Conversion (Pixel to Meters)

Each room's polygon coordinates are multiplied by `meters_per_pixel` and rounded to 3 decimal places:

```rust
let x_m = (x_px * meters_per_pixel * 1000.0).round() / 1000.0;
let y_m = (y_px * meters_per_pixel * 1000.0).round() / 1000.0;
```

The area is recomputed using the Shoelace formula after conversion.

**Output per room**:
```json
{
  "id": "room_1",
  "type": "living_room",
  "name": "客厅",
  "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
  "area": 18.13
}
```

### 3. Wall Generation

If the VLM returned walls, they are converted to meters. If not, walls are auto-generated from room polygon edges:

```rust
fn generate_walls_from_rooms(rooms, thickness, height)
```

For each room, iterates over polygon edges and creates a wall for each unique edge. Edges are deduplicated using a normalized key (smaller endpoint first) so shared walls between adjacent rooms are only created once.

**Each wall**:
```json
{
  "id": "wall_1",
  "start": [1.0, 1.666],
  "end": [4.833, 1.666],
  "height": 2.8,
  "thickness": 0.2,
  "room_refs": ["room_1", "room_2"]
}
```

### 4. Opening Binding

Doors and windows are converted to meters and bound to the nearest wall:

```rust
fn find_nearest_wall(point, walls) -> wall_id
```

Uses point-to-segment distance to find the closest wall, then assigns its ID as `wall_ref`.

**Door format**:
```json
{
  "id": "door_1",
  "type": "door",
  "wall_ref": "wall_1",
  "position": [2.083, 1.666],
  "width": 0.9,
  "height": 2.1,
  "sill_height": 0,
  "swing": "left_inward"
}
```

**Window format**:
```json
{
  "id": "window_1",
  "type": "window",
  "wall_ref": "wall_3",
  "position": [1.0, 0.833],
  "width": 1.2,
  "height": 1.2,
  "sill_height": 0.9
}
```

### 5. Material Generation

Generates PBR materials based on the selected style. Available styles:

| Style | Description |
|-------|-------------|
| `modern_luxury` | Dark wood floors, warm gray walls, dark doors |
| `cream` | Light cream walls, warm wood floors |
| `nordic` | Light gray walls, light wood floors, minimal aesthetic |

Each style defines materials for: wall, ceiling, door, window, and floor (per room type).

```json
{
  "id": "mat_modern_luxury_wall",
  "type": "pbr",
  "name": "modern_luxury Wall",
  "base_color": "#C8C0B8",
  "roughness": 0.85,
  "metalness": 0.0
}
```

Floor materials are room-type-specific. For example, `modern_luxury` floors:

| Room Type | Color | Roughness |
|-----------|-------|-----------|
| living_room | `#6B4F3A` (dark wood) | 0.6 |
| bedroom | `#7A6050` (medium wood) | 0.65 |
| kitchen | `#8A8078` (stone) | 0.5 |
| bathroom | `#A0A0A0` (tile) | 0.3 |
| balcony | `#9A9088` (concrete) | 0.4 |

### 6. Camera Generation

Generates an overview camera plus per-room interior cameras:

**Overview camera**:
```json
{
  "id": "cam_overview",
  "name": "Overview",
  "type": "perspective",
  "position": [cx, extent * 0.8, cz + extent],
  "target": [cx, 0, cz],
  "fov": 50
}
```

Positioned above and behind the scene center, looking down at the floor.

**Per-room cameras**:
```json
{
  "id": "cam_room_1",
  "name": "客厅",
  "type": "perspective",
  "position": [rcx - 1.5, 1.6, rcz - 1.5],
  "target": [rcx, 1.2, rcz],
  "fov": 65
}
```

Positioned at eye height (1.6m) near the room center, looking slightly downward.

### 7. Light Generation

Generates one light per room at ceiling height minus 0.15m:

```rust
let light_y = ceiling_height - 0.15;
```

| Room Type | Light Type | Intensity | Color |
|-----------|-----------|-----------|-------|
| living_room, bedroom | area | 500 | `#fff4e6` (warm) |
| All others | point | 350 | `#ffffff` (neutral) |

Area lights include a `size: [1.5, 1.5]` field for soft shadow rendering.

```json
{
  "id": "light_room_1",
  "type": "area",
  "name": "客厅 Light",
  "position": [3.0, 2.65, 3.0],
  "rotation": [0, 0, 0],
  "intensity": 500,
  "color": "#fff4e6",
  "size": [1.5, 1.5]
}
```

## Output (HomeSceneJSON)

```json
{
  "schema_version": "0.1.0",
  "project": {
    "id": "proj_abc123",
    "name": "Untitled",
    "unit": "meter"
  },
  "global": {
    "style": "modern_luxury",
    "ceiling_height": 2.8,
    "wall_thickness": 0.2
  },
  "rooms": [...],
  "walls": [...],
  "openings": [...],
  "objects": [],
  "materials": [...],
  "lights": [...],
  "cameras": [...]
}
```

Saved to `data/pipeline/{project_id}/scene_normalized.json`.

## Hybrid Pipeline Differences

In the hybrid pipeline, the `convert.rs` module handles the pixel-to-meter conversion using the best `ScaleCandidate` from PlanGraphJSON. It then calls the normalizer's shared functions for materials, cameras, and lights:

```rust
let materials = normalizer::generate_materials(style, &rooms);
let cameras = normalizer::generate_cameras(&rooms, ceiling_height);
let lights = normalizer::generate_lights(&rooms, ceiling_height);
```

The hybrid converter also assigns `floor_material`, `wall_material`, and `ceiling_material` references directly to each room, whereas the legacy normalizer patches these in a separate step via `patch_room_materials()`.
