---
sidebar_position: 4
title: Changelog
description: Version history and release notes for Planova
---

# Changelog

## v0.1.0 -- Hybrid Pipeline Scale & Geometry Accuracy

**Released: 2026-05-09**

### Problem

Hybrid CV+VLM pipeline produced incorrect room areas (~3x too large) and wrong scale (mpp=0.02 vs actual ~0.0076). Legacy pipeline with the same floor plan produced near-perfect results (27m2, 14m2, 9.4m2).

### Root Causes

1. **Scale**: VLM returned implausible mpp (0.02 -> 27.4m building), plausibility threshold too generous (50m). Annotation-derived mpp used `img_w * 0.8` as wall extent estimate instead of actual wall bounding box.
2. **Room face polygons**: Extended from wall centerline to centerline without clipping to wall bounding box, causing outer cells to include margin strips outside the building.
3. **Wall thickness over-correction**: Annotation mpp added wall thickness to bbox extent, but annotations measure room interior (centerline-to-centerline), not outer building dims.

### Changes

**Scale detection** (`plan_graph.rs`)
- Annotation mpp now uses wall bounding box extent directly (no wall thickness correction)
- Average mpp across all annotations instead of minimum -- compensates for pixel/meter aspect ratio difference
- `extract_scale_candidates` takes `wall_segments` parameter to compute bbox

**Room face polygons** (`plan_graph.rs`)
- New `clip_polygon_to_rect()` -- Sutherland-Hodgman clipping to wall bounding box
- Face polygons clipped to remove margin strips outside building
- Minimum segment length filter (50px) for grid generation -- removes short noise segments
- Cell fallback: ensures every room label gets at least one grid cell

**Wall detection** (`wall_graph.rs`)
- Zhang-Suen skeletonization before Hough line detection -- reduces 37 wall segments to ~7
- Endpoint extension: extends segment endpoints to intersect perpendicular walls
- Parallel segment merge with center-based clustering
- Degenerate segment removal (length < 4px)
- Pre-allocated skeletonize buffers -- eliminates ~600MB transient allocations per run

**Code cleanup**
- Hoisted `wall_bbox()` out of per-label loop (was called redundantly per room)
- Replaced `cell_owner.clone()` with lightweight count array
- Removed 13 unnecessary WHAT comments
- Tightened test assertions: alignment > 0.5, mpp 0.005-0.015, total area 20-100m2

### Results

| Metric | Before | After |
|--------|--------|-------|
| Scale mpp | 0.01 (VLM, wrong) | 0.0083 (annotation-derived) |
| Area (living room) | 39.2 m2 | 29.6 m2 (target: 27.0) |
| Area (bedroom) | 22.0 m2 | 12.8 m2 (target: 14.0) |
| Area (bathroom) | 15.9 m2 | 8.3 m2 (target: 9.4) |
| Total area | 77.1 m2 | 50.7 m2 (target: 50.4) |
| Validation score | 0.45 | 0.95 |
| Alignment overall | 0.42 | 0.64 |

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| v0.1.0 | 2026-05-09 | Hybrid pipeline scale detection and room face geometry accuracy fixes |
