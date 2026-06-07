---
sidebar_position: 7
title: Geometry Repair
---

# Geometry Repair

**Module**: `src-tauri/src/pipeline/repair.rs`
**Function**: `repair_scene(scene: &mut Value) -> Vec<String>`

The repair stage automatically fixes common geometry issues in the VLM output before validation. It operates on the HomeSceneJSON in meter coordinates and returns a log of all repair actions taken.

## Repair Operations

### Room Polygon Repairs

| Operation | Description | Threshold | Implementation |
|-----------|-------------|-----------|----------------|
| Degenerate removal | Remove rooms with area &lt; 0.5 m^2 | `MIN_ROOM_AREA = 0.5` | `rooms.retain()` |
| Vertex snapping | Snap nearby vertices to shared coordinates | `SNAP_THRESHOLD = 0.05` (5cm) | Grid-based snap map |
| Orthogonalization | Align near-H/V edges to exact H/V | `ORTHO_THRESHOLD_DEG = 10.0` | Edge angle analysis |
| Closure repair | Append first point if polygon unclosed | 1mm gap tolerance | Distance check |
| Overlap detection | Detect and flag room polygon overlaps | 50% vertex containment | Point-in-polygon test |

#### Vertex Snapping

Builds a spatial grid from all polygon vertices across all rooms. Vertices within 5cm of each other are snapped to their average position:

```rust
fn build_snap_map(points, threshold: 0.05)
// Grid cell size = threshold * 1000 (5cm -> 50 units)
// Points in the same cell -> snap to centroid
```

This ensures shared walls between adjacent rooms have exactly matching coordinates.

#### Orthogonalization

For each polygon edge, checks if the angle is within 10 degrees of horizontal or vertical. If any edge needs correction, snaps all edges:

- If `|dx| > |dz|`: snap to horizontal (keep X, set Z to start's Z)
- If `|dz| >= |dx|`: snap to vertical (keep Z, set X to start's X)

#### Closure Repair

Checks if the first and last polygon points are more than 1mm apart. If so, appends a copy of the first point.

#### Overlap Detection

For each pair of rooms, checks if more than 50% of one room's vertices fall inside the other room's polygon. Overlaps are flagged but not auto-resolved (may need manual review).

### Wall Repairs

| Operation | Description | Threshold | Implementation |
|-----------|-------------|-----------|----------------|
| Endpoint snapping | Snap nearby wall endpoints to shared coordinates | `WALL_SNAP_THRESHOLD = 0.05` (5cm) | Same grid-based snap map |
| Collinear merging | Merge collinear and nearby wall segments | angle &lt; 5 deg, dist &lt; 10cm | Projection-based merge |
| room_refs repair | Fix room_refs based on wall-polygon edge matching | midpoint dist &lt; 30cm, length ratio &gt; 0.5 | Edge proximity check |

#### Collinear Merging

Two walls can be merged if:
1. Angle difference &lt; 5 degrees (`COLLINEAR_ANGLE_THRESHOLD_DEG`)
2. One wall's endpoint is within 10cm of the other wall's line (`COLLINEAR_DIST_THRESHOLD`)

The merged wall spans the two extreme endpoints along the common direction:

```rust
fn merge_collinear_walls(walls) {
    // For each pair (i, j):
    //   1. Check angle similarity
    //   2. Check point-to-segment distance
    //   3. Project all 4 endpoints onto the common direction
    //   4. Take the two extreme points as the new wall
    //   5. Mark j for removal
}
```

#### room_refs Repair

For each wall, finds rooms whose polygon has an edge close to the wall:

```rust
fn fix_wall_room_refs(wall, rooms) -> bool
```

For each room polygon edge:
1. Compute the wall midpoint and edge midpoint
2. Compute midpoint distance
3. Compute length ratio (shorter/longer)
4. If midpoint distance &lt; 30cm AND length ratio &gt; 0.5, the room is a match

If the matching rooms differ from the current `room_refs`, updates the wall.

### Opening Repairs

| Operation | Description | Threshold |
|-----------|-------------|-----------|
| Rebinding | Rebind openings to nearest wall | `wall_thickness * 2` |

For each door and window:
1. Find the nearest wall using point-to-segment distance
2. If the nearest wall differs from the current `wall_ref` AND distance &lt;= `wall_thickness * 2`, rebind

## Constants Summary

| Constant | Value | Used By |
|----------|-------|---------|
| `SNAP_THRESHOLD` | 0.05m (5cm) | Room vertex snapping |
| `ORTHO_THRESHOLD_DEG` | 10.0 deg | Edge orthogonalization |
| `MIN_ROOM_AREA` | 0.5 m^2 | Degenerate room removal |
| `WALL_SNAP_THRESHOLD` | 0.05m (5cm) | Wall endpoint snapping |
| `COLLINEAR_DIST_THRESHOLD` | 0.1m (10cm) | Collinear wall merging |
| `COLLINEAR_ANGLE_THRESHOLD_DEG` | 5.0 deg | Collinear wall merging |

## Repair Log Output

Returns a `Vec<String>` of human-readable repair actions:

```
removed 1 degenerate room(s) with area < 0.5 m^2
snapped 18 polygon vertex/vertices to nearby points
orthogonalized 3 room polygon(s)
closed 1 unclosed polygon(s)
detected 1 room overlap(s) -- may need manual review
snapped 6 wall endpoint(s)
merged 2 collinear wall segment(s)
fixed room_refs for 4 wall(s)
rebound 1 opening(s) to closer wall
```

Saved to `data/pipeline/{project_id}/repair_log.json`.

## Implementation Details

### Spatial Grid for Snapping

The snap map uses a grid-based spatial hash for efficient neighbor lookup:

```rust
fn build_snap_map(points, threshold) -> HashMap<(i64, i64), [f64; 2]> {
    let grid = (threshold * 1000.0) as i64;  // 5cm -> 50
    // Each point maps to a cell: (x*1000/grid, y*1000/grid)
    // Points in the same cell -> snap to their centroid
}
```

### Point-in-Polygon Test

Uses the ray-casting algorithm for overlap detection:

```rust
fn point_in_polygon(point, polygon) -> bool {
    // Cast a ray from the point and count edge crossings
    // Odd crossings = inside, even = outside
}
```

### Ordering

Repairs run in a fixed order: rooms first, then walls, then openings. This ensures that wall repairs can reference the already-repaired room polygons, and opening repairs can reference repaired walls.

## When to Expect Repairs

| VLM Quality | Expected Repairs |
|-------------|-----------------|
| High (clear walls, good labels) | Few vertex snaps, maybe 1-2 merges |
| Medium (some ambiguity) | Vertex snaps, orthogonalization, closure fixes |
| Low (faint walls, guessing) | Many snaps, degenerate removals, overlap warnings |
