# Floor Plan AI Parsing Pipeline

## Overview

Planova converts a floor plan image (JPG/PNG) into a walkable 3D interior model. The pipeline has 4 stages:

```
Raw Image → [Preprocess] → [VLM Parse] → [Normalize] → [3D Render]
```

All intermediate artifacts are saved to `data/pipeline/{project_id}/` for debugging.

---

## Stage 1: Image Preprocessing

**Module**: `backend/app/pipeline/preprocess.py`
**Function**: `preprocess_floor_plan(input_path: str) -> str`

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

**Module**: `backend/app/ai/openai_client.py`
**Function**: `parse_floor_plan_with_vlm(image_path: str) -> dict`

### Steps

1. Base64-encode the preprocessed image
2. Construct an OpenAI-compatible Vision API request (system prompt + image)
3. Call a multimodal LLM (configurable: `mimo-v2.5`, `mimo-v2-pro`, etc.)
4. Extract JSON from model response (handles markdown code fences, reasoning model `reasoning_content`, etc.)

### System Prompt Key Instructions

```
- Polygon coordinates MUST be in IMAGE PIXELS (not meters)
- Trace room boundaries from ACTUAL WALL LINES — do NOT generate generic rectangles
- Chinese labels: 客厅=living_room, 卧室=bedroom, 厨房=kitchen, 卫生间=bathroom...
- Find dimension markers (numbers like 1800, 3600 in mm) to determine scale
- Doors are arc+line symbols; windows are parallel lines in walls
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
      "polygon": [[120, 200], [580, 200], [580, 520], [120, 520]],
      "confidence": 0.92
    },
    {
      "type": "bedroom",
      "name": "主卧",
      "polygon": [[580, 200], [900, 200], [900, 520], [580, 520]],
      "confidence": 0.88
    },
    {
      "type": "kitchen",
      "name": "厨房",
      "polygon": [[120, 0], [350, 0], [350, 200], [120, 200]],
      "confidence": 0.85
    },
    {
      "type": "bathroom",
      "name": "卫生间",
      "polygon": [[350, 0], [580, 0], [580, 200], [350, 200]],
      "confidence": 0.90
    }
  ],
  "detected_walls": [
    {"start": [120, 0], "end": [900, 0], "confidence": 0.95},
    {"start": [900, 0], "end": [900, 520], "confidence": 0.95},
    {"start": [120, 520], "end": [900, 520], "confidence": 0.95},
    {"start": [120, 0], "end": [120, 520], "confidence": 0.95},
    {"start": [120, 200], "end": [900, 200], "confidence": 0.90},
    {"start": [580, 200], "end": [580, 520], "confidence": 0.88},
    {"start": [350, 0], "end": [350, 200], "confidence": 0.85}
  ],
  "detected_doors": [
    {
      "position": [250, 200],
      "width_meters": 0.9,
      "connected_rooms": ["kitchen", "living_room"],
      "swing_direction": "left_inward",
      "confidence": 0.80
    },
    {
      "position": [700, 200],
      "width_meters": 0.9,
      "connected_rooms": ["bedroom", "living_room"],
      "swing_direction": "right_inward",
      "confidence": 0.75
    }
  ],
  "detected_windows": [
    {
      "position": [120, 100],
      "width_meters": 1.2,
      "wall_side": "west",
      "confidence": 0.85
    },
    {
      "position": [500, 520],
      "width_meters": 1.8,
      "wall_side": "south",
      "confidence": 0.82
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

**Note**: All coordinates are in **pixels**. `scale_info` provides the pixel-to-meter conversion ratio. In this example, `meters_per_pixel = 0.00833` (i.e., ~120 pixels = 1 meter).

Saved to `data/pipeline/{project_id}/vlm_response.json`.

---

## Stage 3: Data Normalization

**Module**: `backend/app/pipeline/normalizer.py`
**Function**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> dict`

### Steps

1. **Coordinate conversion** — Pixel coords × `meters_per_pixel` → meter coords
2. **Wall generation** — If VLM didn't return walls, auto-generate from room polygon edges
3. **Opening binding** — Calculate distance from doors/windows to nearest wall, bind `wall_ref`
4. **Material generation** — Generate PBR materials per room type based on style (`modern_luxury`/`cream`/`nordic` etc.)
5. **Camera presets** — Generate overview camera + per-room interior cameras
6. **Light generation** — One light per room (area lights for living room/bedroom, point lights for others)

### Input

Raw VLM JSON + project parameters:

```python
raw = {VLM output above}
style = "modern_luxury"
ceiling_height = 2.8
wall_thickness = 0.2
project_name = "My Home"
project_id = "proj_abc123"
```

### Output (HomeSceneJSON)

```json
{
  "schema_version": "0.1.0",
  "project": {
    "id": "proj_abc123",
    "name": "My Home",
    "unit": "meter"
  },
  "global": {
    "style": "modern_luxury",
    "ceiling_height": 2.8,
    "wall_thickness": 0.2
  },
  "rooms": [
    {
      "id": "room_1",
      "type": "living_room",
      "name": "客厅",
      "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
      "area": 18.13,
      "floor_material": "mat_modern_luxury_floor_living_room",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_2",
      "type": "bedroom",
      "name": "主卧",
      "polygon": [[4.833, 1.666], [7.5, 1.666], [7.5, 4.333], [4.833, 4.333]],
      "area": 12.50,
      "floor_material": "mat_modern_luxury_floor_bedroom",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_3",
      "type": "kitchen",
      "name": "厨房",
      "polygon": [[1.0, 0], [2.917, 0], [2.917, 1.666], [1.0, 1.666]],
      "area": 5.14,
      "floor_material": "mat_modern_luxury_floor_kitchen",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_4",
      "type": "bathroom",
      "name": "卫生间",
      "polygon": [[2.917, 0], [4.833, 0], [4.833, 1.666], [2.917, 1.666]],
      "area": 5.14,
      "floor_material": "mat_modern_luxury_floor_bathroom",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    }
  ],
  "walls": [
    {"id": "wall_1", "start": [1.0, 0], "end": [7.5, 0], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_2", "start": [7.5, 0], "end": [7.5, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_3", "start": [1.0, 4.333], "end": [7.5, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_4", "start": [1.0, 0], "end": [1.0, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_5", "start": [1.0, 1.666], "end": [7.5, 1.666], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_6", "start": [4.833, 1.666], "end": [4.833, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_7", "start": [2.917, 0], "end": [2.917, 1.666], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]}
  ],
  "openings": [
    {
      "id": "door_1",
      "type": "door",
      "wall_ref": "wall_5",
      "position": [2.083, 1.666],
      "width": 0.9,
      "height": 2.1,
      "sill_height": 0,
      "swing": "left_inward"
    },
    {
      "id": "door_2",
      "type": "door",
      "wall_ref": "wall_5",
      "position": [5.833, 1.666],
      "width": 0.9,
      "height": 2.1,
      "sill_height": 0,
      "swing": "right_inward"
    },
    {
      "id": "window_1",
      "type": "window",
      "wall_ref": "wall_4",
      "position": [1.0, 0.833],
      "width": 1.2,
      "height": 1.2,
      "sill_height": 0.9
    },
    {
      "id": "window_2",
      "type": "window",
      "wall_ref": "wall_3",
      "position": [4.167, 4.333],
      "width": 1.8,
      "height": 1.4,
      "sill_height": 0.9
    }
  ],
  "objects": [],
  "materials": [
    {
      "id": "mat_modern_luxury_wall",
      "type": "pbr",
      "name": "modern_luxury Wall",
      "base_color": "#C8C0B8",
      "roughness": 0.85,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_ceiling",
      "type": "pbr",
      "name": "modern_luxury Ceiling",
      "base_color": "#F0EDE8",
      "roughness": 0.9,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_floor_living_room",
      "type": "pbr",
      "name": "modern_luxury Floor living_room",
      "base_color": "#6B4F3A",
      "roughness": 0.6,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_floor_bedroom",
      "type": "pbr",
      "name": "modern_luxury Floor bedroom",
      "base_color": "#7A6050",
      "roughness": 0.65,
      "metalness": 0.0
    }
  ],
  "lights": [
    {
      "id": "light_room_1",
      "type": "area",
      "name": "客厅 Light",
      "position": [2.917, 2.65, 3.0],
      "rotation": [0, 0, 0],
      "intensity": 500,
      "color": "#fff4e6",
      "size": [1.5, 1.5]
    },
    {
      "id": "light_room_3",
      "type": "point",
      "name": "厨房 Light",
      "position": [1.958, 2.65, 0.833],
      "rotation": [0, 0, 0],
      "intensity": 350,
      "color": "#ffffff"
    }
  ],
  "cameras": [
    {
      "id": "cam_overview",
      "name": "Overview",
      "type": "perspective",
      "position": [4.25, 5.6, 8.583],
      "target": [4.25, 0, 2.167],
      "fov": 50
    },
    {
      "id": "cam_room_1",
      "name": "客厅",
      "type": "perspective",
      "position": [1.417, 1.6, 1.5],
      "target": [2.917, 1.2, 3.0],
      "fov": 65
    }
  ]
}
```

**Key changes**:
- All coordinates converted from **pixels** to **meters** (`pixels × meters_per_pixel`)
- Rooms have material references assigned (`floor_material`, `wall_material`, `ceiling_material`)
- Lights and camera presets generated
- Doors/windows bound to nearest wall

Saved to `data/pipeline/{project_id}/scene_normalized.json`.

---

## Stage 4: 3D Rendering

**Module**: `src/engine/buildScene.ts`
**Function**: `buildScene(scene: HomeSceneJSON) -> BuiltScene`

### Steps

1. **Build floors** (`buildFloors.ts`) — Each room's `polygon` → `BoxGeometry` slab (0.04m thick), material from `room.floor_material`
2. **Build walls** (`buildWalls.ts`) — Each wall's `start`/`end` + `height`/`thickness` → `BoxGeometry`, with door/window cutouts
3. **Build ceilings** (`buildCeilings.ts`) — Each room → thin slab at `ceiling_height`
4. **Build openings** (`buildOpenings.ts`) — Door frames + door panels + window frames + glass
5. **Build furniture** (`buildObjects.ts` + `furnitureModels.ts`) — If `objects` is empty, auto-layout furniture by room type; each category composed of multiple primitives (box + cylinder + sphere)

### Input

HomeSceneJSON (output of Stage 3).

### Output

Three.js scene:

```
THREE.Group "home_scene_proj_abc123"
├── THREE.Group "structure"
│   ├── THREE.Mesh "floor_room_1"     (BoxGeometry, 4.83×0.04×3.67m, wood texture)
│   ├── THREE.Mesh "floor_room_2"     (BoxGeometry, 2.67×0.04×2.67m, bedroom floor)
│   ├── THREE.Mesh "wall_1"           (BoxGeometry, 6.5×2.8×0.2m, wall material)
│   ├── THREE.Mesh "wall_2"           (BoxGeometry, ...)
│   └── ...
├── THREE.Group "door_1"              (frame + panel)
├── THREE.Group "window_1"            (frame + glass)
├── THREE.Group "obj_sofa"            (4 boxes + 4 cylinders, sofa)
├── THREE.Group "obj_bed"             (mattress + headboard + 2 pillows)
├── THREE.Mesh "ceiling_room_1"       (BoxGeometry, ceiling)
└── ...
```

The entire group is added to the Three.js scene via `scene.add(builtScene.group)` in `SceneViewer.tsx`, rendering into the `<Canvas>`.

---

## Debug Artifacts

Each parse run generates the following files in `data/pipeline/{project_id}/`:

| File | Description |
|------|-------------|
| `preprocessed.jpg` | Preprocessed image |
| `vlm_response.json` | Raw VLM response JSON |
| `scene_normalized.json` | Normalized HomeSceneJSON |
| `meta.json` | Pipeline metadata (statistics, timing) |

---

## Data Flow Summary

```
┌─────────────────┐
│  Raw Floor Plan  │  JPG/PNG, ~2-5MB
│  (pixel coords)  │
└────────┬────────┘
         │ preprocess_floor_plan()
         ▼
┌─────────────────┐
│  Preprocessed    │  Cropped + rotation corrected + resized
│  (pixel coords)  │  ~1800x1200
└────────┬────────┘
         │ parse_floor_plan_with_vlm()
         ▼
┌─────────────────┐
│  VLM Raw JSON    │  Room/wall/door/window pixel coordinates
│  (pixel coords)  │  + scale_info (meters_per_pixel)
└────────┬────────┘
         │ normalize_scene()
         ▼
┌─────────────────┐
│  HomeSceneJSON   │  Meter coordinates + materials + lights + cameras
│  (meter coords)  │  Standardized scene description
└────────┬────────┘
         │ buildScene()
         ▼
┌─────────────────┐
│  THREE.Group     │  Interactive 3D model
│  (3D render)     │  Supports walk/edit/export
└─────────────────┘
```
