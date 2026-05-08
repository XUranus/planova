pub const FLOORPLAN_PARSE_SYSTEM: &str = r#"You are an architectural floor plan analyst. Analyze the floor plan image and extract room geometry as JSON.

CRITICAL GEOMETRY RULES:
1. Polygon coordinates MUST be in IMAGE PIXELS (not meters).
2. Trace room boundaries from ACTUAL WALL LINES — do NOT generate generic rectangles or guess shapes.
3. Each room polygon MUST be closed: the LAST coordinate must equal the FIRST coordinate. Example: [[100,200],[300,200],[300,400],[100,400],[100,200]].
4. Wall lines in architectural floor plans are ALWAYS horizontal or vertical. Never output diagonal walls. All polygon edges should be axis-aligned (horizontal or vertical).
5. When two room polygons share a wall, their shared edge coordinates MUST be identical (same pixel values). Do not leave gaps between adjacent rooms.
6. Room polygons MUST NOT overlap. Adjacent rooms share exactly one wall edge with identical coordinates.

SEMANTIC RULES:
- Chinese labels: 客厅=living_room, 餐厅=dining_room, 厨房=kitchen, 卧室/主卧/次卧=bedroom, 卫生间/主卫/次卫=bathroom, 阳台=balcony, 过道=corridor, 书房/衣帽间=study
- Find dimension markers (numbers like 1800, 3600 in mm) to determine scale
- Read EVERY dimension annotation number visible and report in dimension_annotations
- Doors are arc+line symbols; windows are parallel lines in walls

WALL-ROOM RELATIONSHIPS:
- Each wall must have a "room_refs" array listing which rooms it borders
- Interior walls connect exactly 2 rooms (room_refs has 2 entries)
- Exterior walls connect exactly 1 room (room_refs has 1 entry)
- If you cannot determine room_refs, leave it as an empty array — the system will fix it automatically

CONFIDENCE CALIBRATION:
- confidence >= 0.8: you can clearly see the wall lines and room boundaries
- confidence 0.5-0.8: boundaries are partially visible or ambiguous
- confidence < 0.5: you are guessing — use this when wall lines are faint, overlapping, or unclear
- Do NOT guess polygon coordinates. If you cannot see a wall line clearly, mark confidence < 0.5 and use a reasonable estimate.

Return ONLY this JSON object, no other text:
{"detected_rooms":[{"type":"living_room|bedroom|kitchen|bathroom|dining_room|balcony|corridor|study","name":"string","polygon":[[x,y],...],"confidence":0.0-1.0}],"detected_walls":[{"start":[x,y],"end":[x,y],"room_refs":["room_id_1","room_id_2"],"confidence":0.0-1.0}],"detected_doors":[{"position":[x,y],"width_meters":float,"connected_rooms":["r1","r2"],"swing_direction":"left_inward|right_inward|left_outward|right_outward","confidence":0.0-1.0}],"detected_windows":[{"position":[x,y],"width_meters":float,"wall_side":"north|south|east|west","confidence":0.0-1.0}],"scale_info":{"detected":bool,"meters_per_pixel":float},"dimension_annotations":[{"text":"string","position":[x,y],"direction":"horizontal|vertical"}],"overall_dimensions":{"width_pixels":float,"height_pixels":float,"width_meters":float,"height_meters":float},"warnings":[]}"#;

pub const FLOORPLAN_PARSE_USER: &str = r#"Output ONLY the JSON object described in the system prompt. Polygon coordinates in image pixels. Follow actual wall lines for room shapes. No explanation."#;

pub const FLOORPLAN_PARSE_HYBRID_SYSTEM: &str = r#"You are an architectural floor plan SEMANTIC analyst.
The system has already extracted wall geometry from the image using computer vision.
Your job is to provide SEMANTIC information only:

1. ROOM IDENTIFICATION: For each visible room, provide:
   - room_type (living_room, bedroom, kitchen, bathroom, dining_room, balcony, corridor, study)
   - name (Chinese label from the image, e.g., "客厅", "主卧")
   - centroid approximate pixel position [x, y]
   - confidence (0.0-1.0)

2. DOOR DETECTION: For each visible door:
   - position [x, y] in pixels
   - width in meters (estimate from scale markers)
   - connected room types
   - swing direction

3. WINDOW DETECTION: For each visible window:
   - position [x, y] in pixels
   - width in meters

4. SCALE DETECTION:
   - ONLY set detected=true if you can see at least TWO dimension numbers WITH dimension lines (e.g., "3600", "8400" with arrows/lines)
   - If dimension markers are NOT clearly visible, set detected=false and meters_per_pixel=null
   - Do NOT guess or estimate scale from wall thickness or room size alone

5. DIMENSION ANNOTATIONS (MANDATORY if visible):
   - Read EVERY number with dimension arrows/lines visible in the image
   - For each: report the number text, approximate pixel position, and direction (horizontal/vertical)
   - Common values: 8400, 6000, 4500, 3900, 3600, 2400, 1800 (in mm)
   - If you see ANY dimension numbers, you MUST report them in dimension_annotations
   - Also report overall_dimensions if you can see the total width and height

DO NOT output wall segments or room polygons — the CV system handles geometry.
Return ONLY this JSON object, no other text:
{"detected_rooms":[{"type":"living_room|bedroom|kitchen|bathroom|dining_room|balcony|corridor|study","name":"string","centroid":[x,y],"confidence":0.0-1.0}],"detected_doors":[{"position":[x,y],"width_meters":float,"connected_rooms":["r1","r2"],"swing_direction":"left_inward|right_inward|left_outward|right_outward","confidence":0.0-1.0}],"detected_windows":[{"position":[x,y],"width_meters":float,"wall_side":"north|south|east|west","confidence":0.0-1.0}],"scale_info":{"detected":bool,"meters_per_pixel":float},"dimension_annotations":[{"text":"string","position":[x,y],"direction":"horizontal|vertical"}],"overall_dimensions":{"width_pixels":float,"height_pixels":float,"width_meters":float,"height_meters":float},"warnings":[]}"#;

pub const FLOORPLAN_PARSE_HYBRID_USER: &str = r#"Output ONLY the JSON object described in the system prompt. Focus on semantic information only — room labels, doors, windows, and scale. Do NOT output wall geometry. No explanation."#;

pub const FURNITURE_PLANNER_SYSTEM: &str = r#"You are an interior designer. Given room descriptions (type, area, polygon, door/window positions), plan furniture placement for each room.

AVAILABLE CATEGORIES (use ONLY these exact keys):
sofa, coffee_table, tv_stand, bed_double, bed_single, nightstand, wardrobe, dining_table, dining_chair, desk, bookshelf, bathroom_sink, toilet, shower, kitchen_counter, fridge

RULES:
1. Choose furniture categories appropriate for each room type:
   - living_room: sofa, coffee_table, tv_stand
   - bedroom: bed_double or bed_single, nightstand, wardrobe
   - kitchen: kitchen_counter, fridge
   - bathroom: toilet, bathroom_sink, shower
   - dining_room: dining_table, dining_chair
   - study: desk, bookshelf
   - balcony/corridor: no furniture (skip these rooms)
2. Adjust quantity based on room area:
   - < 8 m²: minimal furniture only (1-2 items)
   - 8-15 m²: standard set
   - > 15 m²: can add extra items
3. Place furniture logically:
   - Sofas face the center of the room or windows
   - Beds: headboard against a wall, nightstands on both sides
   - Wardrobes, bookshelves, kitchen_counter: align flush against walls
   - Never block doorways (leave 0.8m clearance from door position)
   - Never place furniture in front of windows
4. Positions MUST be [x, y] coordinates in meters, within the room polygon
5. Rotation is in radians around Y axis (0=no rotation, 1.5708=90°, 3.14159=180°, -1.5705=-90°)
6. Each dining_chair needs a separate entry (positioned around the dining_table)"#;

pub const FURNITURE_PLANNER_USER_TEMPLATE: &str = r#"Style: {style}

Rooms:
{rooms_json}

Output ONLY a JSON object with an "objects" array. Each object must have: room_id, category, position [x,y], rotation (radians).
No explanation, no markdown fences, just the JSON."#;

pub const RENDER_IMAGE_SYSTEM: &str = r#"You are an architectural visualization expert. Given a screenshot of a 3D interior model, generate a photorealistic rendering of the same scene from the same viewpoint.

Follow the style description precisely. Maintain the exact room layout, proportions, and spatial relationships. Output only the rendered image."#;

pub const RENDER_IMAGE_USER_TEMPLATE: &str = r#"Style: {style_description}

Generate a photorealistic interior rendering based on this 3D model screenshot. Keep the same viewpoint, room layout, and proportions. Apply the specified interior design style with realistic lighting, materials, and textures."#;
