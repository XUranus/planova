# LLM Furniture Auto-Layout Planner

## Overview

Currently, Planova's furniture placement uses a hardcoded `roomFurnitureMap` in `src/data/furnitureLayout.ts` — every living room gets the same sofa + coffee table + TV stand, regardless of room size, shape, or style. This proposal adds an LLM-based planning step to generate context-aware furniture layouts.

## Current Approach

```
normalize_scene() → [hardcoded roomFurnitureMap] → buildObjects()
```

`roomFurnitureMap` assigns a fixed furniture list per room type:

```typescript
// src/data/furnitureLayout.ts
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

Placement logic in `buildObjects.ts`:
1. Pick a random position within the room's AABB
2. Check collision against already-placed furniture
3. Check door exclusion zones
4. If collision-free, place; otherwise retry up to 20 times

## Problems with Current Approach

| # | Problem | Example |
|---|---------|---------|
| 1 | **Ignores room size** | A 5 m² bedroom gets the same furniture as a 20 m² bedroom |
| 2 | **Ignores room shape** | L-shaped rooms get center-placed furniture that overlaps walls |
| 3 | **Ignores style** | `modern_luxury` and `nordic` rooms get identical furniture |
| 4 | **No doorway awareness** | Furniture can block door swing paths despite exclusion zones |
| 5 | **No wall utilization** | Wardrobes, bookshelves should align to walls; current placement is random |
| 6 | **Static categories** | Can't adapt to unusual room types (study, storage, balcony) |

## Proposed Solution: Step 3.5 — LLM Furniture Planning

Insert a new pipeline stage between normalization and 3D rendering:

```
normalize_scene() → [LLM furniture planner] → buildObjects()
```

The LLM receives structured room data (no image) and returns a furniture placement plan. This is a **text-only** API call — much cheaper than the VLM image parsing step.

### Pipeline Integration

```
Raw Image → [Preprocess] → [VLM Parse] → [Normalize] → [LLM Plan] → [3D Render]
                                                    ↑ new step
```

**Module**: `backend/app/pipeline/furniture_planner.py`
**Function**: `plan_furniture(scene: HomeSceneJSON, style: str) -> HomeSceneJSON`

The function fills in the `objects` array of HomeSceneJSON with LLM-placed furniture.

### Input (to LLM)

```json
{
  "style": "modern_luxury",
  "rooms": [
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
    },
    {
      "id": "room_2",
      "type": "bedroom",
      "name": "主卧",
      "area": 12.50,
      "polygon": [[4.833, 1.666], [7.5, 1.666], [7.5, 4.333], [4.833, 4.333]],
      "openings": [
        {"type": "door", "position": [5.833, 1.666], "width": 0.9},
        {"type": "window", "position": [4.167, 4.333], "width": 1.8}
      ]
    }
  ]
}
```

### Output (from LLM)

```json
{
  "objects": [
    {
      "room_id": "room_1",
      "category": "sofa",
      "position": [2.917, 4.0],
      "rotation": 0.0,
      "reasoning": "Place sofa against the south wall, facing north toward the TV area"
    },
    {
      "room_id": "room_1",
      "category": "coffee_table",
      "position": [2.917, 3.2],
      "rotation": 0.0,
      "reasoning": "Center in front of sofa, leaving clear path to the door"
    },
    {
      "room_id": "room_1",
      "category": "tv_stand",
      "position": [2.917, 1.85],
      "rotation": 0.0,
      "reasoning": "Place against the interior wall, facing the sofa"
    },
    {
      "room_id": "room_2",
      "category": "bed",
      "position": [6.167, 3.0],
      "rotation": 0.0,
      "reasoning": "Center bed against the south wall, headboard facing north"
    },
    {
      "room_id": "room_2",
      "category": "wardrobe",
      "position": [7.2, 2.5],
      "rotation": 1.5708,
      "reasoning": "Align wardrobe to the east wall, door facing into the room"
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [5.5, 3.0],
      "rotation": 0.0,
      "reasoning": "Left side of bed"
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [6.833, 3.0],
      "rotation": 0.0,
      "reasoning": "Right side of bed"
    }
  ]
}
```

### LLM Prompt Design

```
You are an interior designer. Given room descriptions (type, area, polygon, door/window positions), plan furniture placement.

Rules:
1. Choose furniture categories appropriate for each room type
2. Adjust quantity based on room area:
   - < 8 m²: minimal furniture only
   - 8-15 m²: standard set
   - > 15 m²: add extra items (side tables, plants, shelving)
3. Place furniture logically:
   - Sofas face TV stands or windows
   - Beds have headboards against walls, nightstands on sides
   - Wardrobes align to walls
   - Never block doorways (leave 0.8m clearance)
   - Never place furniture in front of windows
4. Positions must be within the room polygon
5. All coordinates in meters, matching the input polygon coordinate system
6. Style: {style} — choose furniture that matches this aesthetic

Return ONLY valid JSON with an "objects" array.
```

### Implementation Plan

| Step | Action | File |
|------|--------|------|
| 1 | Create furniture planner module | `backend/app/pipeline/furniture_planner.py` |
| 2 | Call planner after normalize, before save | `backend/app/pipeline/floorplan_parser.py` |
| 3 | Add `objects` rendering in buildObjects | `src/engine/buildObjects.ts` (already supports `objects` array) |
| 4 | Fallback: if LLM fails, use hardcoded layout | `furniture_planner.py` |

### Fallback Strategy

If the LLM call fails (timeout, API error, invalid JSON), the planner returns the scene with `objects: []` and `buildObjects.ts` falls back to the existing hardcoded `roomFurnitureMap` logic. This ensures the pipeline always produces a result.

## Cost Analysis

| Step | Type | Tokens (approx) | Relative Cost |
|------|------|-----------------|---------------|
| VLM Parse | Image + text | ~4000 input + ~2000 output | 1x (baseline) |
| LLM Plan | Text only | ~800 input + ~600 output | ~0.1x |

The furniture planner is ~10x cheaper than VLM parsing because it processes structured text, not images.

## Future Enhancements

- **Multi-room consistency**: Ensure furniture in adjacent rooms doesn't conflict (e.g., shared wall usage)
- **User constraints**: Allow users to pin certain furniture positions before LLM planning
- **Iterative refinement**: LLM reviews its own placement for collisions and adjusts
- **Style-specific catalogs**: Different furniture categories per style (e.g., `nordic` gets a bookshelf in living room, `modern_luxury` gets a bar cart)
