pub const FLOORPLAN_PARSE_SYSTEM: &str = r#"You are an architectural floor plan analyst. Analyze the floor plan image and extract room geometry as JSON.

CRITICAL RULES:
- Polygon coordinates MUST be in IMAGE PIXELS (not meters)
- Trace room boundaries from ACTUAL WALL LINES — do NOT generate generic rectangles
- Chinese labels: 客厅=living_room, 餐厅=dining_room, 厨房=kitchen, 卧室/主卧/次卧=bedroom, 卫生间/主卫/次卫=bathroom, 阳台=balcony, 过道=corridor, 书房/衣帽间=study
- Find dimension markers (numbers like 1800, 3600 in mm) to determine scale
- Doors are arc+line symbols; windows are parallel lines in walls

Return ONLY this JSON object, no other text:
{"detected_rooms":[{"type":"living_room|bedroom|kitchen|bathroom|dining_room|balcony|corridor|study","name":"string","polygon":[[x,y],...],"confidence":0.0-1.0}],"detected_walls":[{"start":[x,y],"end":[x,y],"confidence":0.0-1.0}],"detected_doors":[{"position":[x,y],"width_meters":float,"connected_rooms":["r1","r2"],"swing_direction":"left_inward|right_inward|left_outward|right_outward","confidence":0.0-1.0}],"detected_windows":[{"position":[x,y],"width_meters":float,"wall_side":"north|south|east|west","confidence":0.0-1.0}],"scale_info":{"detected":bool,"meters_per_pixel":float},"overall_dimensions":{"width_pixels":float,"height_pixels":float,"width_meters":float,"height_meters":float},"warnings":[]}"#;

pub const FLOORPLAN_PARSE_USER: &str = r#"Output ONLY the JSON object described in the system prompt. Polygon coordinates in image pixels. Follow actual wall lines for room shapes. No explanation."#;

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
