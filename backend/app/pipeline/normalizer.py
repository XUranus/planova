import math
import uuid


def normalize_scene(
    raw: dict,
    style: str,
    ceiling_height: float,
    wall_thickness: float,
    project_name: str,
    project_id: str,
) -> dict:
    """
    Normalize raw VLM output into a valid HomeSceneJSON structure.
    Handles: coordinate normalization, wall closing, opening binding,
    default materials, camera presets, and lights.
    """
    rooms = raw.get("detected_rooms", [])
    walls = raw.get("detected_walls", [])
    doors = raw.get("detected_doors", [])
    windows = raw.get("detected_windows", [])
    scale_info = raw.get("scale_info", {})

    # Determine scale
    meters_per_pixel = scale_info.get("meters_per_pixel", 0.02)
    if not scale_info.get("detected", False):
        # Estimate scale from overall dimensions or use default
        overall = raw.get("overall_dimensions", {})
        if overall.get("width_meters", 0) > 0:
            # We know real dimensions, compute scale from pixel bbox
            meters_per_pixel = _estimate_scale_from_bbox(rooms, overall)

    # Normalize rooms
    norm_rooms = _normalize_rooms(rooms, meters_per_pixel)

    # Normalize walls
    norm_walls = _normalize_walls(walls, meters_per_pixel, wall_thickness, ceiling_height, norm_rooms)

    # Normalize openings (doors + windows)
    norm_openings = _normalize_openings(doors, windows, meters_per_pixel, norm_walls)

    # Generate camera presets
    cameras = _generate_cameras(norm_rooms, ceiling_height)

    # Generate lights
    lights = _generate_lights(norm_rooms, ceiling_height)

    return {
        "schema_version": "0.1.0",
        "project": {
            "id": project_id,
            "name": project_name,
            "unit": "meter",
        },
        "global": {
            "style": style,
            "ceiling_height": ceiling_height,
            "wall_thickness": wall_thickness,
        },
        "rooms": norm_rooms,
        "walls": norm_walls,
        "openings": norm_openings,
        "objects": [],
        "materials": [],
        "lights": lights,
        "cameras": cameras,
    }


def _estimate_scale_from_bbox(rooms: list[dict], overall: dict) -> float:
    """Estimate meters_per_pixel from overall real dimensions and detected room bboxes."""
    if not rooms:
        return 0.02

    # Find pixel bounding box of all rooms
    all_points = []
    for room in rooms:
        all_points.extend(room.get("polygon", []))
    if not all_points:
        return 0.02

    xs = [p[0] for p in all_points]
    ys = [p[1] for p in all_points]
    pixel_width = max(xs) - min(xs)
    pixel_height = max(ys) - min(ys)

    if pixel_width <= 0 or pixel_height <= 0:
        return 0.02

    real_width = overall.get("width_meters", 10)
    real_height = overall.get("height_meters", 10)

    return min(real_width / pixel_width, real_height / pixel_height)


def _normalize_rooms(rooms: list[dict], scale: float) -> list[dict]:
    """Convert pixel polygons to meter polygons and assign IDs."""
    result = []
    for i, room in enumerate(rooms):
        polygon_px = room.get("polygon", [])
        polygon_m = [[round(p[0] * scale, 3), round(p[1] * scale, 3)] for p in polygon_px]

        room_type = room.get("type", "living_room")
        name = room.get("name", f"Room {i+1}")

        result.append({
            "id": f"room_{i+1}",
            "type": room_type,
            "name": name,
            "polygon": polygon_m,
            "area": round(_polygon_area(polygon_m), 2),
        })
    return result


def _normalize_walls(
    walls: list[dict],
    scale: float,
    thickness: float,
    height: float,
    rooms: list[dict],
) -> list[dict]:
    """Convert pixel walls to meter walls and assign room references."""
    result = []
    for i, wall in enumerate(walls):
        start = wall.get("start", [0, 0])
        end = wall.get("end", [0, 0])

        result.append({
            "id": f"wall_{i+1}",
            "start": [round(start[0] * scale, 3), round(start[1] * scale, 3)],
            "end": [round(end[0] * scale, 3), round(end[1] * scale, 3)],
            "height": height,
            "thickness": thickness,
            "room_refs": [r["id"] for r in rooms[:2]],  # Simplified
        })

    # If no walls detected, generate from room polygons
    if not result and rooms:
        result = _generate_walls_from_rooms(rooms, thickness, height)

    return result


def _generate_walls_from_rooms(rooms: list[dict], thickness: float, height: float) -> list[dict]:
    """Generate wall segments from room polygon edges."""
    walls = []
    wall_idx = 0
    seen_edges = set()

    for room in rooms:
        polygon = room.get("polygon", [])
        for i in range(len(polygon)):
            p1 = tuple(polygon[i])
            p2 = tuple(polygon[(i + 1) % len(polygon)])
            # Normalize edge direction for dedup
            edge_key = (min(p1, p2), max(p1, p2))
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            wall_idx += 1
            walls.append({
                "id": f"wall_{wall_idx}",
                "start": list(p1),
                "end": list(p2),
                "height": height,
                "thickness": thickness,
                "room_refs": [room["id"]],
            })

    return walls


def _normalize_openings(
    doors: list[dict],
    windows: list[dict],
    scale: float,
    walls: list[dict],
) -> list[dict]:
    """Convert pixel openings to meter openings and bind to nearest wall."""
    result = []
    idx = 0

    for door in doors:
        idx += 1
        pos = door.get("position", [0, 0])
        pos_m = [round(pos[0] * scale, 3), round(pos[1] * scale, 3)]
        wall_ref = _find_nearest_wall(pos_m, walls)

        result.append({
            "id": f"door_{idx}",
            "type": "door",
            "wall_ref": wall_ref,
            "position": pos_m,
            "width": round(door.get("width", 0.9), 2),
            "height": 2.1,
            "sill_height": 0,
            "swing": door.get("swing_direction", "left_inward"),
        })

    for window in windows:
        idx += 1
        pos = window.get("position", [0, 0])
        pos_m = [round(pos[0] * scale, 3), round(pos[1] * scale, 3)]
        wall_ref = _find_nearest_wall(pos_m, walls)

        result.append({
            "id": f"window_{idx}",
            "type": "window",
            "wall_ref": wall_ref,
            "position": pos_m,
            "width": round(window.get("width", 1.2), 2),
            "height": 1.2,
            "sill_height": 0.9,
        })

    return result


def _find_nearest_wall(point: list[float], walls: list[dict]) -> str:
    """Find the ID of the wall nearest to a given point."""
    if not walls:
        return ""

    min_dist = float("inf")
    nearest_id = walls[0]["id"]

    for wall in walls:
        dist = _point_to_segment_distance(
            point, wall["start"], wall["end"]
        )
        if dist < min_dist:
            min_dist = dist
            nearest_id = wall["id"]

    return nearest_id


def _point_to_segment_distance(p: list[float], a: list[float], b: list[float]) -> float:
    """Compute distance from point p to line segment ab."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_x = ax + t * dx
    proj_y = ay + t * dy
    return math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2)


def _polygon_area(polygon: list[list[float]]) -> float:
    """Compute polygon area using the Shoelace formula."""
    n = len(polygon)
    if n < 3:
        return 0
    area = 0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i][0] * polygon[j][1]
        area -= polygon[j][0] * polygon[i][1]
    return abs(area) / 2


def _generate_cameras(rooms: list[dict], ceiling_height: float) -> list[dict]:
    """Generate camera presets: one overview, one per room."""
    cameras = []

    # Find scene center and extents
    all_points = []
    for room in rooms:
        all_points.extend(room["polygon"])
    if not all_points:
        return [{"id": "cam_overview", "name": "Overview", "type": "perspective",
                 "position": [5, 8, 10], "target": [5, 0, 5], "fov": 50}]

    xs = [p[0] for p in all_points]
    zs = [p[1] for p in all_points]
    cx = (min(xs) + max(xs)) / 2
    cz = (min(zs) + max(zs)) / 2
    extent = max(max(xs) - min(xs), max(zs) - min(zs))

    cameras.append({
        "id": "cam_overview",
        "name": "Overview",
        "type": "perspective",
        "position": [cx, extent * 0.8, cz + extent],
        "target": [cx, 0, cz],
        "fov": 50,
    })

    for i, room in enumerate(rooms):
        polygon = room["polygon"]
        if not polygon:
            continue
        rxs = [p[0] for p in polygon]
        rzs = [p[1] for p in polygon]
        rcx = (min(rxs) + max(rxs)) / 2
        rcz = (min(rzs) + max(rzs)) / 2
        cameras.append({
            "id": f"cam_{room['id']}",
            "name": room.get("name", f"Room {i+1}"),
            "type": "perspective",
            "position": [rcx - 1.5, 1.6, rcz - 1.5],
            "target": [rcx, 1.2, rcz],
            "fov": 65,
        })

    return cameras


def _generate_lights(rooms: list[dict], ceiling_height: float) -> list[dict]:
    """Generate one light per room."""
    lights = []
    light_y = ceiling_height - 0.15

    for i, room in enumerate(rooms):
        polygon = room["polygon"]
        if not polygon:
            continue
        xs = [p[0] for p in polygon]
        zs = [p[1] for p in polygon]
        cx = (min(xs) + max(xs)) / 2
        cz = (min(zs) + max(zs)) / 2

        is_main = room.get("type") in ("living_room", "bedroom")
        lights.append({
            "id": f"light_{room['id']}",
            "type": "area" if is_main else "point",
            "name": f"{room.get('name', 'Room')} Light",
            "position": [cx, light_y, cz],
            "rotation": [0, 0, 0],
            "intensity": 500 if is_main else 350,
            "color": "#fff4e6" if is_main else "#ffffff",
            **({"size": [1.5, 1.5]} if is_main else {}),
        })

    return lights
