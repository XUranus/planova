---
sidebar_position: 9
title: Furniture Planning
---

# Furniture Planning

**Module**: `src-tauri/src/pipeline/furniture.rs`
**Function**: `plan_furniture(scene: &Value, data_dir: &Path) -> Result<Value, String>`

The furniture planning stage uses a text-only LLM call to generate context-aware furniture placement based on room type, area, and door/window positions.

## Pipeline Position

```
Normalize → Repair → Validate → [Furniture] → Save → 3D Render
```

In the hybrid pipeline, furniture planning is gated on quality scores (see [Validation](./validation.md)).

## How It Works

### Input Preparation

1. **Filter rooms**: skip balcony, corridor, and rooms with area outside 1-100 m^2
2. **Find openings**: for each room, find doors/windows within its AABB (with 0.5m margin)
3. **Build compact input**: room id, type, name, area, polygon, and nearby openings

### LLM Call

The planner sends a structured text prompt to a chat LLM (not a vision model). This is approximately 10x cheaper than the VLM call.

**System prompt** (`FURNITURE_PLANNER_SYSTEM`):

```
You are an interior designer. Given room descriptions (type, area, polygon,
door/window positions), plan furniture placement for each room.

AVAILABLE CATEGORIES (use ONLY these exact keys):
sofa, coffee_table, tv_stand, bed_double, bed_single, nightstand, wardrobe,
dining_table, dining_chair, desk, bookshelf, bathroom_sink, toilet, shower,
kitchen_counter, fridge

RULES:
1. Choose furniture categories appropriate for each room type
2. Adjust quantity based on room area:
   - < 8 m^2: minimal furniture only (1-2 items)
   - 8-15 m^2: standard set
   - > 15 m^2: can add extra items
3. Place furniture logically:
   - Sofas face the center of the room or windows
   - Beds: headboard against a wall, nightstands on both sides
   - Wardrobes, bookshelves, kitchen_counter: align flush against walls
   - Never block doorways (leave 0.8m clearance from door position)
   - Never place furniture in front of windows
4. Positions MUST be [x, y] coordinates in meters, within the room polygon
5. Rotation is in radians around Y axis
6. Each dining_chair needs a separate entry
```

**User message** (template with `{style}` and `{rooms_json}` replaced):

```
Style: modern_luxury

Rooms:
[
  {
    "id": "room_1",
    "type": "living_room",
    "name": "客厅",
    "area": 18.13,
    "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
    "openings": [
      {"type": "door", "position": [2.083, 1.666], "width": 0.9},
      {"type": "window", "position": [1.0, 0.833], "width": 1.2}
    ]
  }
]

Output ONLY a JSON object with an "objects" array. Each object must have:
room_id, category, position [x,y], rotation (radians).
No explanation, no markdown fences, just the JSON.
```

### Retry Logic

- Up to 2 attempts
- Only retries on timeout errors
- Waits `5 * attempt` seconds between retries

### Response Processing

1. **Extract JSON** from the LLM response
2. **Validate each object**:
   - Category must be in the known `CATEGORY_SIZES` table
   - Position must have at least 2 coordinates
   - Room ID must match an existing room
   - Position must be within the room's AABB (with 0.3m margin)
3. **Build output objects** with proper formatting

## Available Furniture Categories

Each category has a defined size `[width, height, depth]` in meters:

| Category | Width | Height | Depth | Typical Room |
|----------|-------|--------|-------|--------------|
| sofa | 2.2 | 0.85 | 0.9 | living_room |
| coffee_table | 1.2 | 0.45 | 0.6 | living_room |
| tv_stand | 1.8 | 0.5 | 0.4 | living_room |
| bed_double | 2.0 | 0.55 | 1.6 | bedroom |
| bed_single | 2.0 | 0.55 | 1.0 | bedroom |
| nightstand | 0.5 | 0.55 | 0.4 | bedroom |
| wardrobe | 1.8 | 2.2 | 0.6 | bedroom |
| dining_table | 1.6 | 0.75 | 0.9 | dining_room |
| dining_chair | 0.45 | 0.9 | 0.45 | dining_room |
| desk | 1.4 | 0.75 | 0.7 | study |
| bookshelf | 1.0 | 2.0 | 0.35 | study |
| bathroom_sink | 0.6 | 0.85 | 0.5 | bathroom |
| toilet | 0.4 | 0.75 | 0.65 | bathroom |
| shower | 1.0 | 2.1 | 1.0 | bathroom |
| kitchen_counter | 2.4 | 0.9 | 0.6 | kitchen |
| fridge | 0.7 | 1.8 | 0.65 | kitchen |

## Output Format

Each furniture object in the scene JSON:

```json
{
  "id": "furniture_1",
  "type": "furniture",
  "category": "sofa",
  "room_ref": "room_1",
  "position": [2.917, 0, 4.0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "size": [2.2, 0.85, 0.9]
}
```

Note: the Y component of position is always 0 (floor level). The LLM receives [x, y] (2D) coordinates; the pipeline adds the Y=0 floor component.

### Full LLM Response Example

```json
{
  "objects": [
    {
      "room_id": "room_1",
      "category": "sofa",
      "position": [2.917, 4.0],
      "rotation": 0.0,
      "reasoning": "Place sofa against the south wall, facing north"
    },
    {
      "room_id": "room_1",
      "category": "coffee_table",
      "position": [2.917, 3.2],
      "rotation": 0.0
    },
    {
      "room_id": "room_1",
      "category": "tv_stand",
      "position": [2.917, 1.85],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "bed_double",
      "position": [6.167, 3.0],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "wardrobe",
      "position": [7.2, 2.5],
      "rotation": 1.5708
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [5.5, 3.0],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [6.833, 3.0],
      "rotation": 0.0
    }
  ]
}
```

## Fallback Behavior

If the LLM call fails (timeout, API error, invalid JSON), the planner returns the scene unchanged with `objects: []`. The frontend `buildObjects.ts` then falls back to a hardcoded `roomFurnitureMap`:

```typescript
const roomFurnitureMap: Record<string, FurnitureItem[]> = {
  living_room: [
    { category: 'sofa', count: 1, placement: 'wall_adjacent' },
    { category: 'coffee_table', count: 1, placement: 'center' },
    { category: 'tv_stand', count: 1, placement: 'wall_adjacent' },
  ],
  bedroom: [
    { category: 'bed', count: 1, placement: 'center' },
    { category: 'wardrobe', count: 1, placement: 'wall_adjacent' },
    { category: 'nightstand', count: 2, placement: 'wall_adjacent' },
  ],
  // ...
}
```

This ensures the pipeline always produces a renderable result.

## Cost

| Step | Type | Approximate Tokens | Relative Cost |
|------|------|-------------------|---------------|
| VLM Parse | Image + text | ~4000 input + ~2000 output | 1x |
| Furniture LLM | Text only | ~800 input + ~600 output | ~0.1x |

The furniture planner is ~10x cheaper than VLM parsing because it processes structured text, not images.

## Style Awareness

The furniture planner receives the scene's style (`modern_luxury`, `cream`, `nordic`) and is instructed to choose furniture matching the aesthetic. The LLM may vary furniture selection and quantity based on style, though the available categories remain the same.

## Validation Checks

After receiving the LLM response, the planner validates:

1. **Unknown categories**: objects with categories not in `CATEGORY_SIZES` are skipped
2. **Missing positions**: objects with fewer than 2 position coordinates are skipped
3. **Unknown rooms**: objects referencing non-existent room IDs are skipped
4. **Out-of-bounds**: objects whose position falls outside the room's AABB (with 0.3m margin) are skipped

The planner logs how many objects passed validation vs. how many the LLM proposed:

```
Furniture planner: 12/15 objects validated
```
