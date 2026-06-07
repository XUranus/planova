---
sidebar_position: 2
title: Type Reference
description: TypeScript and Rust type definitions used across Planova
---

# Type Reference

This page documents all shared data types in Planova: TypeScript interfaces from `src/types/scene.ts` and Rust structs from `src-tauri/src/models.rs`.

---

## HomeSceneJSON

The unified data protocol linking floor plan parsing, AI planning, 3D generation, rendering, and export. Defined in `src/types/scene.ts`.

```ts
interface HomeSceneJSON {
  schema_version: string
  project: HomeSceneProject
  global: HomeSceneGlobal
  rooms: Room[]
  walls: Wall[]
  openings: Opening[]
  objects: SceneObject[]
  materials: SceneMaterial[]
  lights: SceneLight[]
  cameras: CameraPreset[]
  parse_quality?: ParseQuality
}
```

### HomeSceneProject

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Project UUID |
| `name` | `string` | Project name |
| `unit` | `'meter'` | Measurement unit (always `"meter"`) |

### HomeSceneGlobal

| Field | Type | Description |
|-------|------|-------------|
| `style` | `string` | Interior design style key |
| `ceiling_height` | `number` | Ceiling height in meters |
| `wall_thickness` | `number` | Wall thickness in meters |
| `texture_overrides.floor` | `string?` | Floor texture override path |
| `texture_overrides.wall` | `string?` | Wall texture override path |
| `texture_overrides.ceiling` | `string?` | Ceiling texture override path |

### Room

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Room UUID |
| `type` | `RoomType` | Room classification |
| `name` | `string` | Display name |
| `polygon` | `Vec2[]` | Floor polygon vertices in meters |
| `area` | `number?` | Area in square meters |
| `floor_material` | `string?` | Floor material ID |
| `wall_material` | `string?` | Wall material ID |
| `ceiling_material` | `string?` | Ceiling material ID |

### Wall

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Wall UUID |
| `start` | `Vec2` | Start point (meters) |
| `end` | `Vec2` | End point (meters) |
| `height` | `number` | Wall height in meters |
| `thickness` | `number` | Wall thickness in meters |
| `material` | `string?` | Material ID |
| `room_refs` | `string[]` | IDs of adjacent rooms |

### Opening

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Opening UUID |
| `type` | `OpeningType` | `"door"` or `"window"` |
| `wall_ref` | `string` | Parent wall ID |
| `position` | `Vec2` | Center position on wall (meters) |
| `width` | `number` | Opening width in meters |
| `height` | `number` | Opening height in meters |
| `sill_height` | `number` | Sill height from floor (meters) |
| `swing` | `DoorSwing?` | Door swing direction (doors only) |

### SceneObject

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Object UUID |
| `type` | `'furniture' \| 'decoration'` | Object category |
| `category` | `string` | Specific category (e.g. `"sofa"`, `"lamp"`) |
| `asset_id` | `string?` | 3D asset reference |
| `room_ref` | `string?` | Room ID this object belongs to |
| `position` | `Vec3` | World position (meters) |
| `rotation` | `Vec3` | Euler rotation (radians) |
| `scale` | `Vec3` | Scale factor per axis |
| `size` | `Vec3` | Bounding box dimensions (meters) |
| `material_overrides` | `Record<string, string>?` | Per-slot material overrides |

### SceneMaterial

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Material UUID |
| `type` | `'pbr'` | Material model (always PBR) |
| `name` | `string` | Display name |
| `base_color` | `string` | Hex color (e.g. `"#f5f5f5"`) |
| `roughness` | `number` | Surface roughness (0-1) |
| `metalness` | `number` | Metallic factor (0-1) |
| `transparent` | `boolean?` | Whether material is transparent |
| `opacity` | `number?` | Opacity (0-1) |
| `texture_urls.base_color` | `string?` | Base color texture URL |
| `texture_urls.normal` | `string?` | Normal map URL |
| `texture_urls.roughness` | `string?` | Roughness map URL |

### SceneLight

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Light UUID |
| `type` | `LightType` | Light type |
| `name` | `string` | Display name |
| `position` | `Vec3` | World position (meters) |
| `rotation` | `Vec3` | Euler rotation (radians) |
| `intensity` | `number` | Light intensity |
| `color` | `string` | Hex color |
| `size` | `Vec2?` | Area light dimensions (meters) |

### CameraPreset

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Camera UUID |
| `name` | `string` | Preset name |
| `type` | `CameraType` | Camera projection type |
| `position` | `Vec3` | Camera position (meters) |
| `target` | `Vec3` | Look-at target (meters) |
| `fov` | `number` | Field of view (degrees) |

### ParseQuality

| Field | Type | Description |
|-------|------|-------------|
| `overall_score` | `number` | Combined quality score (0-1) |
| `geometry_score` | `number` | Geometry validity score |
| `semantic_score` | `number` | Semantic correctness score |
| `scale_score` | `number` | Scale accuracy score |
| `image_alignment_score` | `number` | Alignment with source image score |
| `needs_user_review` | `boolean` | Whether manual review is recommended |
| `image_alignment` | `ImageAlignmentReport?` | Detailed alignment metrics |

### ImageAlignmentReport

| Field | Type | Description |
|-------|------|-------------|
| `wall_iou` | `number` | Wall mask Intersection over Union |
| `wall_precision` | `number` | Wall detection precision |
| `wall_recall` | `number` | Wall detection recall |
| `overall` | `number` | Combined alignment score |

### DiagnosisReport

| Field | Type | Description |
|-------|------|-------------|
| `missing_wall_regions` | `Array<{ bbox: number[], description: string }>` | Regions where walls were expected but not detected |
| `extra_wall_regions` | `Array<{ bbox: number[], description: string }>` | Regions with detected walls that should not exist |
| `scale_suspicious` | `boolean` | Whether the scale estimate is suspect |
| `scale_reason` | `string?` | Explanation for suspicious scale |
| `room_coverage` | `number` | Fraction of image area covered by rooms |

---

## Enums

### `RoomType`

```ts
type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining_room'
  | 'balcony'
  | 'corridor'
  | 'study'
```

### `OpeningType`

```ts
type OpeningType = 'door' | 'window'
```

### `DoorSwing`

```ts
type DoorSwing =
  | 'left_inward'
  | 'left_outward'
  | 'right_inward'
  | 'right_outward'
```

### `LightType`

```ts
type LightType = 'area' | 'point' | 'spot' | 'directional'
```

### `CameraType`

```ts
type CameraType = 'perspective' | 'orthographic'
```

---

## Primitive Aliases

```ts
type Vec2 = [number, number]
type Vec3 = [number, number, number]
```

---

## Rust Model Structs

Defined in `src-tauri/src/models.rs`. All structs derive `Debug`, `Clone`, `Serialize`, `Deserialize`.

### `Project`

| Field | Type | Rust Type |
|-------|------|-----------|
| `id` | UUID | `String` |
| `name` | Name | `String` |
| `description` | Description | `String` |
| `style` | Style key | `String` |
| `status` | Status | `String` |
| `created_at` | ISO 8601 | `String` |
| `updated_at` | ISO 8601 | `String` |

### `UploadedFile`

| Field | Type | Rust Type |
|-------|------|-----------|
| `id` | UUID | `String` |
| `project_id` | FK | `String` |
| `original_filename` | Filename | `String` |
| `file_type` | MIME type | `String` |
| `file_size` | Bytes | `i64` |
| `storage_path` | Absolute path | `String` |
| `preview_path` | Absolute path | `String` |
| `parse_status` | Status | `String` |
| `created_at` | ISO 8601 | `String` |

### `GenerationTask`

| Field | Type | Rust Type |
|-------|------|-----------|
| `id` | UUID | `String` |
| `project_id` | FK | `String` |
| `task_type` | Type | `String` |
| `status` | Status | `String` |
| `progress` | 0-100 | `i64` |
| `input_data` | JSON | `Option<serde_json::Value>` |
| `output_data` | JSON | `Option<serde_json::Value>` |
| `error_message` | Error text | `String` |
| `created_at` | ISO 8601 | `String` |
| `updated_at` | ISO 8601 | `String` |

---

## API Response Types

These are the types returned by Tauri IPC commands. They mirror the database models but exclude internal fields like `storage_path`.

### `ProjectResponse`

Same fields as `Project`: `id`, `name`, `description`, `style`, `status`, `created_at`, `updated_at`.

### `FileResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | File UUID |
| `project_id` | `string` | Parent project UUID |
| `original_filename` | `string` | Original filename |
| `file_type` | `string` | MIME type |
| `file_size` | `number` | Size in bytes |
| `preview_url` | `string` | Base64-encoded preview data URL |
| `parse_status` | `string` | `""`, `"parsing"`, `"completed"`, or `"failed"` |
| `created_at` | `string` | ISO 8601 timestamp |

### `TaskResponse`

Same fields as `GenerationTask`: `id`, `project_id`, `task_type`, `status`, `progress`, `input_data`, `output_data`, `error_message`, `created_at`, `updated_at`.

### `SceneResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Scene UUID |
| `project_id` | `string` | Parent project UUID |
| `file_id` | `string` | Source file UUID |
| `name` | `string` | Scene name |
| `schema_version` | `string` | Schema version (e.g. `"0.1.0"`) |
| `scene_json` | `HomeSceneJSON?` | Parsed scene JSON (null if parse failed) |
| `created_at` | `string` | ISO 8601 timestamp |
| `updated_at` | `string` | ISO 8601 timestamp |

---

## Type Mapping: TypeScript to Rust

| TypeScript | Rust | Notes |
|-----------|------|-------|
| `string` | `String` | Always heap-allocated |
| `number` | `i64` / `f64` | `i64` for counts and progress, `f64` for coordinates |
| `boolean` | `bool` | |
| `T \| null` | `Option<T>` | Serialized as `null` or omitted |
| `T[]` | `Vec<T>` | JSON arrays |
| `object` | `serde_json::Value` | Arbitrary JSON (scene_json, input/output data) |
| `Record<string, string>` | `HashMap<String, String>` | Key-value maps |
| `Vec2` = `[number, number]` | `[f64; 2]` | Fixed-size array |
| `Vec3` = `[number, number, number]` | `[f64; 3]` | Fixed-size array |
