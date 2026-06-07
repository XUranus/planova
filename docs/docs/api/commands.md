---
sidebar_position: 1
title: IPC Commands Reference
description: Complete reference for all Tauri IPC commands
---

# IPC Commands Reference

Planova uses Tauri's IPC (Inter-Process Communication) to invoke Rust functions from the TypeScript frontend via `invoke()`.

```ts
import { invoke } from '@tauri-apps/api/core'

const result = await invoke<ReturnType>('command_name', { param: value })
```

All commands are defined in `src-tauri/src/commands/` and registered in `src-tauri/src/lib.rs`.

---

## Projects

### `create_project`

Create a new project.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Project name |
| `description` | `string` | Project description |
| `style` | `string` | Interior design style key |

**Returns**: `ProjectResponse`

```ts
const project = await invoke('create_project', {
  name: 'My Apartment',
  description: '3BR floor plan',
  style: 'modern_luxury',
})
```

---

### `list_projects`

List all projects, ordered by creation date (newest first).

| Parameter | Type | Description |
|-----------|------|-------------|
| *(none)* | | |

**Returns**: `ProjectResponse[]`

---

### `get_project`

Get a single project by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |

**Returns**: `ProjectResponse`

**Errors**: `"Project not found"`

---

### `update_project`

Update project fields. All fields are optional -- only provided fields are updated.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |
| `name` | `string?` | New name |
| `description` | `string?` | New description |
| `style` | `string?` | New style key |
| `status` | `string?` | New status |

**Returns**: `ProjectResponse`

---

### `delete_project`

Delete a project and all associated files, scenes, tasks, and pipeline artifacts from disk and database.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |

**Returns**: `void`

---

## Files

### `upload_file`

Upload a file from a local file path. Automatically triggers floor plan parsing if an LLM API key is configured and the file is a valid image.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |
| `file_path` | `string` | Absolute path to the file on disk |

**Returns**: `FileResponse`

---

### `upload_file_from_base64`

Upload a file from a base64-encoded string. Same auto-parse behavior as `upload_file`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |
| `base64_data` | `string` | Base64-encoded file content |
| `filename` | `string` | Original filename (used to detect content type) |

**Returns**: `FileResponse`

---

### `list_files`

List all uploaded files for a project, ordered by creation date.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |

**Returns**: `FileResponse[]`

---

### `get_file_preview`

Get a file's preview as a base64-encoded data URL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_id` | `string` | File UUID |

**Returns**: `string` (base64)

**Errors**: `"File not found"`, `"Preview file not found on disk"`

---

### `delete_file`

Delete a file and its associated scenes from disk and database.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_id` | `string` | File UUID |

**Returns**: `void`

---

### `save_file`

Save raw bytes to an arbitrary file path on disk.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Absolute output path |
| `base64_data` | `string` | Base64-encoded file content |

**Returns**: `void`

---

## Scenes

### `list_scenes`

List all scenes for a project.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |

**Returns**: `SceneResponse[]`

---

### `get_scene`

Get a single scene by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scene_id` | `string` | Scene UUID |

**Returns**: `SceneResponse | null`

---

### `update_scene`

Replace the `scene_json` field of an existing scene.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scene_id` | `string` | Scene UUID |
| `scene_json` | `object` | Full HomeSceneJSON object |

**Returns**: `SceneResponse`

**Errors**: `"Scene not found"`

---

### `delete_scene`

Delete a scene.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scene_id` | `string` | Scene UUID |

**Returns**: `void`

---

## Tasks (Pipeline)

### `start_generation`

Start a floor plan parsing pipeline for a file. Validates LLM configuration and image validity before spawning.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |
| `file_id` | `string` | File UUID |
| `style` | `string` | Interior design style key |
| `ceiling_height` | `number?` | Ceiling height in meters (default: 2.8) |
| `wall_thickness` | `number?` | Wall thickness in meters (default: 0.2) |

**Returns**: `TaskResponse`

**Errors**: `"LLM API key not configured"`, `"LLM Base URL not configured"`, `"File not found"`, `"Uploaded file is not a valid image"`

---

### `retry_parse`

Re-run the parsing pipeline for a file that previously failed. Resets the file's parse status before spawning.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_id` | `string` | File UUID |

**Returns**: `TaskResponse`

---

### `get_task`

Get a task by its ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | `string` | Task UUID |

**Returns**: `TaskResponse`

**Errors**: `"Task not found"`

---

### `get_task_by_file`

Find an active (pending/running) task for a given file. Returns `null` if no active task exists.

| Parameter | Type | Description |
|-----------|------|-------------|
| `file_id` | `string` | File UUID |

**Returns**: `TaskResponse | null`

---

### `cancel_task`

Cancel a pending or running task. Sets its status to `cancelled`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | `string` | Task UUID |

**Returns**: `void`

**Errors**: `"Task cannot be cancelled"` (if task is already completed/failed/cancelled)

---

### `get_task_pipeline`

Get pipeline metadata and artifact URLs for a task.

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | `string` | Task UUID |

**Returns**: `object` -- Pipeline metadata JSON with a `urls` field containing relative paths to artifacts:

```json
{
  "urls": {
    "preprocessed_image": "/pipeline/{project_id}/preprocessed.png",
    "vlm_response": "/pipeline/{project_id}/vlm_response.json",
    "scene_normalized": "/pipeline/{project_id}/scene_normalized.json"
  }
}
```

**Errors**: `"Task not found"`, `"Pipeline artifacts not found"`

---

### `get_pipeline_artifacts`

Get all pipeline artifacts for a project, including base64-encoded images and diagnosis data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | `string` | Project UUID |

**Returns**: `object`

```json
{
  "meta": { },
  "overlay_alignment": "<base64 PNG>",
  "diagnosis": { },
  "wall_mask": "<base64 PNG>",
  "project_id": "..."
}
```

**Errors**: `"Pipeline artifacts not found"`

---

## Settings

### `get_settings`

Read the application settings file.

| Parameter | Type | Description |
|-----------|------|-------------|
| *(none)* | | |

**Returns**: `object` -- Full settings JSON.

---

### `update_settings`

Merge partial settings into the existing settings file.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `object` | Partial settings to merge |

**Returns**: `object` -- Updated full settings JSON.

---

### `test_llm_connection`

Test connectivity to an LLM or image generation API endpoint.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string?` | Capability: `"vlm"` (default) or `"image"` |
| `config_override` | `object?` | Override `{ base_url, api_key, model }` instead of reading from settings |

**Returns**: `object`

```json
{
  "success": true,
  "api_reachable": true,
  "model_available": true,
  "latency_ms": 342,
  "error": null,
  "details": {
    "text_response": "OK"
  }
}
```

For image providers, the test sends a simple generation request. For chat/VLM providers, it sends a minimal chat completion.

---

## Renders

### `export_render`

Generate an AI-rendered image from a 3D scene screenshot. Uses the image generation provider configured in settings.

| Parameter | Type | Description |
|-----------|------|-------------|
| `screenshot_base64` | `string` | Base64-encoded screenshot (with or without `data:image/png;base64,` prefix) |
| `style` | `string` | Interior design style key |
| `prompt` | `string?` | Custom render prompt (defaults to style description) |

**Returns**: `object`

```json
{
  "success": true,
  "render_path": "/path/to/render_20260509_143022.png",
  "render_base64": "<base64 PNG>"
}
```

**Errors**: `"Image generation API key not configured"`, `"Image generation Base URL not configured"`, `"Image generation Model not configured"`

**Supported styles**: `modern_luxury`, `cream`, `nordic`, `chinese`, `wabi_sabi`, `industrial`
