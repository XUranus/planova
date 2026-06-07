---
sidebar_position: 4
title: 3D Engine
---

# 3D Engine

Planova's 3D engine converts a `HomeSceneJSON` document into a live Three.js scene. All engine code lives in `src/engine/` and operates purely on data -- it has no React dependencies and can be used outside the UI.

## Scene Building Pipeline

The full pipeline from parsed JSON to renderable geometry:

```
HomeSceneJSON
    │
    ▼
buildScene()                    ← orchestrator
    ├─ clearMaterialCache()
    ├─ clearTextureCache()
    ├─ applyTextureOverrides()  ← merges global texture_overrides into materials
    ├─ buildWalls()             ← wall geometry + materials
    ├─ buildFloors()            ← floor slabs from room polygons
    ├─ buildCeilings()          ← ceiling planes at ceiling_height
    ├─ buildOpenings()          ← door and window models
    └─ buildObjects()           ← furniture placement (pre-existing or auto-generated)
    │
    ▼
THREE.Group (scene graph root)
```

### buildScene Orchestrator

`buildScene()` in `src/engine/buildScene.ts` is the single entry point. It:

1. **Clears caches** -- disposes all cached materials and textures to avoid stale GPU resources on scene reload.
2. **Applies texture overrides** -- `applyTextureOverrides()` patches materials whose IDs contain `_floor`, `_wall`, or `_ceiling` with the global override's texture URL (using the `texture://` scheme for procedural presets).
3. **Delegates to sub-builders** -- each builder returns typed arrays of `{ id, mesh }` objects.
4. **Handles objects** -- if the scene JSON already contains `objects`, each is built directly via `buildObjectFromScene()` (which looks up the furniture catalog and calls `createFurnitureModel`). Otherwise, `buildObjects()` auto-generates furniture placement from the room layout.
5. **Assembles the scene graph** -- creates a root `THREE.Group`, adds a `structure` sub-group (floors + walls merged), then appends openings, objects, and ceilings as direct children.

The function returns a `BuiltScene` object containing the group and all typed sub-arrays, enabling downstream code (e.g., `ObjectEditor`) to access specific meshes by ID.

`disposeScene()` traverses the entire group, disposing every geometry and material, then clears the caches again.

## Sub-Builders

### buildWalls

`src/engine/buildWalls.ts`

Each wall is a single `THREE.Mesh`. Geometry is created by `createWallGeometry()` from `geometryUtils`, which computes a rotated box from the wall's start/end positions, height, and thickness. Material selection cascades:

1. If the wall declares a `material` ID, look it up in the scene's materials array.
2. If a `texture_override` is set and it is a shader preset (`isShaderPreset`), use `createShaderMaterial()`.
3. Otherwise, fall back to `createWallMaterial()` with the texture override.

All wall meshes have `castShadow` and `receiveShadow` enabled.

### buildFloors

`src/engine/buildFloors.ts`

Each room produces one floor mesh. The geometry is a **4 cm thick `BoxGeometry`** (not a flat plane) computed from the room polygon's axis-aligned bounding box. This ensures the floor is always visible from any angle. The slab is translated so its top surface sits at y=0.

Material resolution mirrors the wall logic: room-specific `floor_material` ID, shader preset override, or default `createFloorMaterial()`.

Each `BuiltFloor` also exposes the computed `area` (from `room.area` or `computePolygonArea()`).

### buildCeilings

`src/engine/buildCeilings.ts`

Ceilings use `ShapeGeometry` created from the room polygon via `createPolygonGeometry()`. Each ceiling mesh is positioned at `ceiling_height` and has `scale.y = -1` to flip its normal downward. Visibility is toggled at runtime by `viewerStore.showCeilings`.

### buildOpenings

`src/engine/buildOpenings.ts`

Doors and windows are procedurally modeled from box primitives:

**Doors** consist of:
- Frame: three strips (left, right, top) and a threshold, using `MeshStandardMaterial` with a wood-brown color.
- Panel: an inset rectangle with slight offset based on swing direction.
- Handle: a `CylinderGeometry` positioned on the latch side.

**Windows** consist of:
- Frame: four strips forming a rectangle.
- Glass: a thin transparent pane (`opacity: 0.4`).
- Mullions: vertical and horizontal cross-bars.

Each opening is a `THREE.Group` positioned and rotated to sit within its parent wall.

### buildObjects

`src/engine/buildObjects.ts`

Handles automatic furniture placement when the scene JSON does not include pre-defined objects. The algorithm:

1. **Room classification** -- each room is classified by type (bedroom, living room, kitchen, bathroom, etc.) using `roomFurnitureMap` from `furnitureLayout.ts`.
2. **Bounding box computation** -- the room polygon is converted to an axis-aligned bounding box.
3. **Door exclusion zones** -- door positions are identified and a 0.8m exclusion radius is applied to prevent furniture from blocking doorways.
4. **Placement** -- furniture is placed along walls using `PlacementZone` rules (top, bottom, left, right of the room bbox). Each placement checks for AABB overlap with previously placed objects.
5. **Collision resolution** -- `resolvePosition()` nudges overlapping objects along the wall direction until a valid position is found or the attempt limit is reached.

Each `BuiltObject` contains the `id`, the `THREE.Group` mesh, and the `SceneObject` data record.

## Material System

### Material Factory and Cache

`src/engine/materials.ts`

A `Map<string, THREE.Material>` cache keyed by material ID. Factory functions create `MeshStandardMaterial` instances with sensible defaults:

| Function | Default Color | Roughness | Notes |
|---|---|---|---|
| `createWallMaterial` | `#E8E4DF` | 0.85 | DoubleSide |
| `createFloorMaterial` | `#D9D2C5` | 0.7 | DoubleSide |
| `createCeilingMaterial` | `#FFFFFF` | 0.9 | DoubleSide |
| `createDoorMaterial` | `#8B6F47` | 0.6 | metalness 0.1 |
| `createWindowMaterial` | `#B5D4E8` | 0.1 | transparent, opacity 0.4 |

`getMaterial()` resolves a `SceneMaterial` from the scene JSON, applying `base_color`, `roughness`, `metalness`, `transparent`, and `opacity` fields. If the material's `texture_urls.base_color` uses the `texture://` scheme, the corresponding procedural texture is fetched and applied as the diffuse map.

`clearMaterialCache()` disposes all cached materials and is called at the start of every `buildScene()` invocation.

### Shader Materials

`src/engine/shaderMaterials.ts`

Four GLSL shader presets are implemented via `MeshStandardMaterial.onBeforeCompile`:

| Preset ID | Description |
|---|---|
| `wood_grain` | Procedural wood with grain lines, ring patterns, and FBM noise |
| `marble_vein` | Marble with flowing veins, base color variation, and specular sheen |
| `concrete_proc` | Concrete with fine noise, aggregate spots, and micro-texture |
| `stone_proc` | Stone masonry with brick pattern, mortar lines, and per-block color variation |

Each preset defines:
- `uniforms` -- shader parameters (frequencies, colors, scales)
- `fragmentFunctions` -- GLSL helper functions (all share a common `NOISE_HELPERS` block with `hash21_sh`, `valueNoise_sh`, and `fbm_sh`)
- `fragmentInjection` -- code injected into `<map_fragment>` to override `diffuseColor`
- `vertexInjection` -- code to pass `vWorldPosition` from vertex to fragment shader

`createShaderMaterial()` builds a `MeshStandardMaterial`, then patches its shader source via string replacement on `onBeforeCompile`. The `customProgramCacheKey` is set to the preset ID so Three.js caches compiled programs correctly.

### Procedural Textures

`src/engine/proceduralTextures.ts`

20+ canvas-based texture presets generated at runtime. Each preset is a function `(size: number) => HTMLCanvasElement` that draws a tileable texture using the Canvas 2D API. Categories:

**Floor presets:** oak plank, marble tile, concrete, herringbone, dark walnut, terracotta, porcelain tile, grid tile.

**Wall presets:** white plaster, subway tile, brick, wood panel, stone wall, exposed concrete.

**Ceiling presets:** smooth white, flat white, coffered.

**Shader preview presets:** wood grain, marble vein, concrete proc, stone proc (small previews for the texture picker UI).

Textures use a seeded RNG (`seededRandom`) for deterministic noise, and `addNoise()` applies pixel-level grain. Generated canvases are cached in a `Map` and converted to `THREE.CanvasTexture` on demand via `getTexture()`.

`clearTextureCache()` disposes all cached textures and canvases.

## Furniture Models

`src/engine/furnitureModels.ts`

15 procedural furniture types built from box, cylinder, and sphere primitives:

| Category | Builder Function | Key Primitives |
|---|---|---|
| `sofa` | `buildSofa` | Box seat, back, arms; cylinder legs |
| `coffee_table` | `buildCoffeeTable` | Box top + legs |
| `tv_stand` | `buildTvStand` | Box body + shelves |
| `bed` | `buildBed` | Box mattress, frame, headboard |
| `nightstand` | `buildNightstand` | Box body + drawer line |
| `wardrobe` | `buildWardrobe` | Box body + divider line |
| `dining_table` | `buildDiningTable` | Box top + cylinder legs |
| `dining_chair` | `buildDiningChair` | Box seat, back; cylinder legs |
| `desk` | `buildDesk` | Box top + legs + drawer |
| `bookshelf` | `buildBookshelf` | Box frame + random book boxes |
| `bathroom_sink` | `buildBathroomSink` | Box counter + cylinder basin |
| `toilet` | `buildToilet` | Box base + cylinder bowl + box tank |
| `shower` | `buildShower` | Box tray + transparent glass walls |
| `kitchen_counter` | `buildKitchenCounter` | Box body + countertop |
| `fridge` | `buildFridge` | Box body + handle cylinder |

All builders use helper functions `box()`, `cyl()`, and `sphere()` that create positioned meshes with shadow casting enabled. Color helpers `darken()` and `lighten()` produce accent shades from a single base color.

`createFurnitureModel(category, size, color)` is the public entry point. It looks up the builder by category and scales the resulting group to match the requested dimensions. Unknown categories fall back to `buildFallback` -- a simple colored box.

## Scene Graph Structure

The final Three.js scene graph assembled by `buildScene()`:

```
THREE.Group  "home_scene_{projectId}"
 ├─ THREE.Group  "structure"
 │   ├─ THREE.Mesh  "floor_{roomId}"      (BoxGeometry, per room)
 │   ├─ THREE.Mesh  "wall_{wallId}"        (rotated BoxGeometry, per wall)
 │   ...
 ├─ THREE.Group  "{openingId}"             (door or window, per opening)
 │   ├─ THREE.Mesh  (frame strips)
 │   ├─ THREE.Mesh  (panel / glass)
 │   └─ THREE.Mesh  (handle / mullions)
 ├─ THREE.Group  "{objectId}"              (furniture, per object)
 │   ├─ THREE.Mesh  (body)
 │   ├─ THREE.Mesh  (accent parts)
 │   ...
 └─ THREE.Mesh  "ceiling_{roomId}"         (ShapeGeometry, per room)
```

The `structure` sub-group merges floors and walls for efficient culling. Openings and objects are separate top-level children so they can be individually selected, transformed, or removed. Ceilings are the last children so they render on top and can be toggled via `viewerStore.showCeilings`.
