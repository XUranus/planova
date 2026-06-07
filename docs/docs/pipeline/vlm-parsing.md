---
sidebar_position: 3
title: VLM Multimodal Parsing
---

# VLM Multimodal Parsing

**Module**: `src-tauri/src/ai/client.rs`, `src-tauri/src/ai/prompts.rs`
**Functions**: `call_vlm()`, `call_vlm_hybrid()`, `call_vlm_with_prompts()`

The VLM (Vision Language Model) stage sends the preprocessed floor plan image to a multimodal LLM and extracts structured geometry and semantic data as JSON.

## Two Prompt Modes

The pipeline uses different prompts depending on the mode:

| Mode | Function | Prompt | What VLM Extracts |
|------|----------|--------|--------------------|
| Legacy | `call_vlm()` | `FLOORPLAN_PARSE_SYSTEM` | Full geometry (room polygons, walls) + semantics |
| Hybrid | `call_vlm_hybrid()` | `FLOORPLAN_PARSE_HYBRID_SYSTEM` | Semantics only (room labels/centroids, doors, windows, scale) |

In hybrid mode, wall geometry comes from CV, so the VLM only provides room identification, opening detection, and scale information.

## Request Construction

1. **Base64 encode** the preprocessed image
2. **Build an OpenAI-compatible** Vision API request with:
   - System message: architectural analysis instructions
   - User message: image (as `image_url` with `detail: "high"`) + text prompt
3. **Call the API** with `max_tokens: 16384`, `temperature: 0.1`
4. **Extract JSON** from the response, handling:
   - Direct JSON parse
   - Markdown code fences (` ```json ... ``` `)
   - `{"detected_rooms"` prefix search
   - First `{` to last `}` fallback
   - Reasoning model `reasoning_content` field

```rust
let request_body = serde_json::json!({
    "model": config.model,
    "messages": messages,
    "max_tokens": 16384,
    "temperature": 0.1,
});
```

## Retry Logic

- Up to 3 attempts for VLM calls (legacy), 2 attempts for furniture planning
- Only retries on timeout errors (`timed out`, `timeout`)
- Waits `5 * attempt` seconds between retries
- Non-timeout errors fail immediately

## System Prompt: Legacy Mode

The legacy system prompt instructs the VLM to extract complete floor plan data. Key instructions:

### Geometry Rules
- Polygon coordinates MUST be in **IMAGE PIXELS** (not meters)
- Trace room boundaries from ACTUAL WALL LINES -- do NOT generate generic rectangles
- Each room polygon MUST be closed (last coordinate equals first)
- Wall lines MUST be horizontal or vertical -- never diagonal
- Shared wall edges between adjacent rooms MUST have identical coordinates
- Room polygons MUST NOT overlap

### Semantic Rules
- Chinese label mapping: `客厅` = `living_room`, `卧室/主卧/次卧` = `bedroom`, `厨房` = `kitchen`, `卫生间` = `bathroom`, etc.
- Find dimension markers (numbers like 1800, 3600 in mm) to determine scale
- Read EVERY visible dimension annotation and report in `dimension_annotations`
- Doors are arc+line symbols; windows are parallel lines in walls

### Wall-Room Relationships
- Each wall must have a `room_refs` array listing which rooms it borders
- Interior walls connect exactly 2 rooms
- Exterior walls connect exactly 1 room

### Confidence Calibration
- `>= 0.8`: wall lines and room boundaries clearly visible
- `0.5-0.8`: boundaries partially visible or ambiguous
- `< 0.5`: guessing -- use when wall lines are faint or unclear

## System Prompt: Hybrid Mode

The hybrid prompt tells the VLM that CV has already extracted wall geometry, so it should focus on:

1. **Room identification** -- room_type, name (Chinese label), centroid pixel position, confidence
2. **Door detection** -- position, width (meters), connected rooms, swing direction
3. **Window detection** -- position, width (meters)
4. **Scale detection** -- only set `detected=true` if at least TWO dimension numbers with dimension lines are visible
5. **Dimension annotations** -- MANDATORY if visible; read every number with dimension arrows

The hybrid prompt explicitly says: "DO NOT output wall segments or room polygons -- the CV system handles geometry."

## Output JSON Format

### Legacy Mode Output

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
    {
      "start": [120, 0],
      "end": [900, 0],
      "room_refs": ["room_1"],
      "confidence": 0.95
    }
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
  "dimension_annotations": [
    {
      "text": "3600",
      "position": [400, 550],
      "direction": "horizontal"
    }
  ],
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

### Hybrid Mode Output

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "centroid": [350, 360],
      "confidence": 0.90
    }
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
  "dimension_annotations": [
    {
      "text": "3600",
      "position": [400, 550],
      "direction": "horizontal"
    }
  ],
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

Note the key difference: hybrid mode outputs `centroid` instead of `polygon` for rooms, and omits `detected_walls` entirely.

## Coordinate System

All coordinates in the VLM output are in **image pixels**. The `scale_info` field provides the `meters_per_pixel` conversion ratio used by downstream stages to convert to meters.

| Field | Unit | Notes |
|-------|------|-------|
| Room polygon vertices | pixels | Absolute image coordinates |
| Room centroids | pixels | Hybrid mode only |
| Wall start/end | pixels | Legacy mode only |
| Door/window positions | pixels | |
| `meters_per_pixel` | meters/pixel | Conversion ratio |
| `width_meters` (doors/windows) | meters | Already in real-world units |
| `dimension_annotations.text` | mm | As printed on the floor plan |

## Supported VLM Providers

The pipeline uses an OpenAI-compatible API format, so any provider that implements the `/chat/completions` endpoint with image support works:

- OpenAI (GPT-4o, GPT-4 Vision)
- Compatible local models (via vLLM, Ollama, etc.)
- Other OpenAI-compatible APIs

The VLM configuration is stored in `LlmConfig` with fields: `base_url`, `api_key`, `model`.

## Cost Comparison

| Step | Type | Approximate Tokens | Relative Cost |
|------|------|-------------------|---------------|
| VLM Parse (legacy) | Image + text | ~4000 input + ~2000 output | 1x (baseline) |
| VLM Semantic (hybrid) | Image + text | ~3000 input + ~1500 output | ~0.7x |
| Furniture LLM | Text only | ~800 input + ~600 output | ~0.1x |

The hybrid mode VLM call is slightly cheaper because the prompt asks for less output (no wall geometry).
