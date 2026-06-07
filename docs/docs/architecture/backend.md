---
sidebar_position: 5
title: Backend Architecture
---

# Backend Architecture

The Planova backend is a Tauri v2 application written in Rust. It manages project state, file storage, AI-powered floor plan parsing, and 3D scene generation -- all running locally on the user's machine.

## Module Layout

The entry point is `src-tauri/src/lib.rs`, which initializes the database, registers shared state, and exposes ~25 Tauri commands to the frontend. The backend is organized into these modules:

| Module | Path | Purpose |
|--------|------|---------|
| `commands` | `src/commands/` | Tauri command handlers grouped by domain |
| `db` | `src/db.rs` | SQLite connection, schema, and `AppState` |
| `models` | `src/models.rs` | Shared data structs (`Project`, `UploadedFile`, etc.) |
| `pipeline` | `src/pipeline/` | Floor plan parsing and 3D scene generation |
| `ai` | `src/ai/` | LLM HTTP client, prompt templates, audit logging |
| `settings` | `src/settings.rs` | Settings persistence and LLM config resolution |
| `storage` | `src/storage.rs` | File upload, preview generation, disk I/O |
| `util` | `src/util.rs` | UUID generation |

## Shared Application State

A single `AppState` struct is registered with Tauri's managed state system and shared across all commands:

```rust
pub struct AppState {
    pub db: Mutex<Connection>,   // rusqlite connection (WAL mode, FK enabled)
    pub data_dir: PathBuf,       // app data directory (platform-specific)
    pub runtime: tokio::runtime::Runtime, // dedicated Tokio runtime for async tasks
}
```

On startup the app also resets any tasks left in `pending`/`running`/`executing` status to `failed`, and any files stuck in `parsing` status are marked as `failed`. This prevents stale state from a previous crash or force-quit.

## SQLite Database

Planova uses an embedded SQLite database at `{data_dir}/planova.db` with WAL journaling and foreign keys enabled. The schema consists of four tables:

### `projects`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | TEXT | PK | UUID v4 (no dashes) |
| `name` | TEXT | NOT NULL | Project display name |
| `description` | TEXT | `''` | User-provided description |
| `style` | TEXT | `'modern_luxury'` | Interior style preset |
| `status` | TEXT | `'draft'` | Project lifecycle status |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### `uploaded_files`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | Cascade delete |
| `original_filename` | TEXT | NOT NULL | Original file name |
| `file_type` | TEXT | `''` | MIME type or extension |
| `file_size` | INTEGER | `0` | Bytes |
| `storage_path` | TEXT | `''` | Absolute path to upload |
| `preview_path` | TEXT | `''` | Absolute path to 512x512 preview |
| `parse_status` | TEXT | `''` | `'parsing'`, `'failed'`, or empty |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### `generation_tasks`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | Cascade delete |
| `task_type` | TEXT | `'floorplan_parse'` | Task category |
| `status` | TEXT | `'pending'` | `'pending'`, `'running'`, `'executing'`, `'completed'`, `'failed'` |
| `progress` | INTEGER | `0` | 0-100 progress percentage |
| `input_data` | TEXT | nullable | JSON blob with task inputs |
| `output_data` | TEXT | nullable | JSON blob with task outputs |
| `error_message` | TEXT | `''` | Error details if failed |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### `scenes`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | Cascade delete |
| `file_id` | TEXT | `''` | Source uploaded file |
| `name` | TEXT | `''` | Scene display name |
| `schema_version` | TEXT | `'0.1.0'` | HomeSceneJSON version |
| `scene_json` | TEXT | nullable | Full scene JSON |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

## Commands Module

Tauri commands are organized into six domain files under `src/commands/`:

**`projects`** -- CRUD for projects:
- `create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`

**`files`** -- File upload and management:
- `upload_file` -- accepts file bytes via dialog
- `upload_file_from_base64` -- accepts base64-encoded content
- `list_files`, `get_file_preview`, `delete_file`, `save_file`

**`scenes`** -- Scene management:
- `list_scenes`, `get_scene`, `update_scene`, `delete_scene`

**`tasks`** -- Generation task lifecycle:
- `start_generation` -- kicks off the parsing pipeline
- `retry_parse` -- re-runs a failed parse
- `get_task`, `get_task_by_file`, `cancel_task`
- `get_task_pipeline` -- returns pipeline step info for UI
- `get_pipeline_artifacts` -- returns saved debug artifacts

**`settings`** -- User preferences:
- `get_settings`, `update_settings`, `test_llm_connection`

**`renders`** -- Export:
- `export_render` -- triggers image generation for a scene

## Pipeline Module

The pipeline module (`src/pipeline/`) converts a floor plan image into a 3D `HomeSceneJSON` representation. It supports two modes selectable via settings.

### Legacy Pipeline (7 steps)

A VLM-centric pipeline where a vision-language model does all the work:

1. **Preprocess** -- Clean and normalize the input image (`preprocess`)
2. **VLM Parse** -- Single VLM call extracts walls, rooms, doors, windows, and scale (`ai::client::call_vlm`)
3. **Normalize** -- Transform raw VLM output into HomeSceneJSON (`normalizer`)
4. **Repair** -- Fix geometric issues (gaps, overlaps, invalid polygons) (`repair`)
5. **Validate** -- Score the scene and flag problems (`validate`)
6. **Overlay** -- Generate a debug image showing detected geometry overlaid on the input (`overlay`)
7. **Furniture** -- LLM call to plan furniture placement (`furniture`)

### Hybrid CV+VLM Pipeline (12 steps)

A two-stage pipeline where computer vision handles geometry and the VLM provides semantics:

1. **Preprocess** -- Clean and normalize the input image (`preprocess`)
2. **Wall Mask** -- CV-based extraction of wall regions from the image (`wall_mask`)
3. **Wall Graph** -- Build a graph of wall segments from the mask (`wall_graph`)
4. **VLM Semantics** -- VLM call with a hybrid prompt: rooms, doors, windows, and scale only (geometry already handled by CV) (`ai::client::call_vlm_hybrid`)
5. **PlanGraph** -- Merge CV geometry + VLM semantics into a `PlanGraphJSON` (`plan_graph`)
6. **Convert** -- Transform PlanGraphJSON into HomeSceneJSON (`convert`)
7. **Repair** -- Fix geometric issues (`repair`)
8. **Alignment** -- Compute IoU-based alignment scores comparing the plan graph to the wall mask (`alignment`)
9. **Validate** -- Score the scene with alignment-aware validation (`validate`)
10. **Overlays** -- Generate both VLM and alignment debug overlays (`overlay`, `overlay_alignment`)
11. **Furniture** -- LLM-driven furniture planning, gated by quality thresholds (`furniture`)
12. **Save Artifacts** -- Write all pipeline outputs to disk (`pipeline/{project_id}/`)

The hybrid pipeline falls back to legacy if CV steps fail (wall mask extraction or wall graph building) or if fewer than 3 wall segments are detected. The quality gate for furniture requires: geometry score >= 0.8, scale score >= 0.9, image alignment >= 0.75, and no user review flag.

### Pipeline Submodules

| Submodule | Role |
|-----------|------|
| `preprocess` | Image cleaning and normalization |
| `wall_mask` | Binary wall mask extraction (CV) |
| `wall_graph` | Wall segment graph construction (CV) |
| `plan_graph` | Merges CV + VLM into PlanGraphJSON |
| `convert` | PlanGraphJSON to HomeSceneJSON |
| `normalizer` | VLM output to HomeSceneJSON (legacy path) |
| `repair` | Geometry repair and gap fixing |
| `alignment` | Wall IoU alignment scoring |
| `validate` | Scene quality validation |
| `overlay` | Debug overlay generation |
| `overlay_alignment` | Alignment debug overlay |
| `furniture` | LLM furniture placement planning |

## AI Module

The `ai` module (`src/ai/`) contains three submodules:

### `ai::client` -- LLM HTTP Client

All calls go to OpenAI-compatible `/chat/completions` endpoints with a 120-second timeout. The client supports:

- **`call_vlm`** -- Vision-language model call for full floor plan parsing. Sends the image with the `FLOORPLAN_PARSE_SYSTEM` / `FLOORPLAN_PARSE_USER` prompts. Expects JSON output.
- **`call_vlm_hybrid`** -- VLM call with hybrid prompts (`FLOORPLAN_PARSE_HYBRID_SYSTEM` / `FLOORPLAN_PARSE_HYBRID_USER`). The VLM only provides semantics; geometry comes from CV.
- **`call_llm_text`** -- Text-only LLM call used for furniture planning and other non-vision tasks.
- **`call_image_gen`** -- Image generation with three strategies tried in order: Qwen DashScope multimodal API, OpenAI DALL-E `/images/generations`, and chat completions with image input.

VLM calls include a retry loop (up to 3 attempts) that retries on timeout errors with exponential backoff (5s, 10s, 15s).

The client also handles JSON extraction from LLM responses, including parsing from markdown code fences and partial JSON fragments.

### `ai::prompts` -- Prompt Templates

Prompt constants for each pipeline stage, including system and user prompts for:
- Legacy floor plan parsing
- Hybrid floor plan parsing
- Furniture planning
- Image rendering/generation

### `ai::audit` -- Audit Logging

Every LLM call (VLM, text, image gen) is logged to `{data_dir}/llm_audit/` as JSON files containing the model, messages, response, token usage, latency, and any errors.

## Settings

Settings are stored as a JSON file at `{data_dir}/settings.json`. The default configuration:

```json
{
    "language": "en-US",
    "pipeline_mode": "hybrid_cv_vlm",
    "llm_vlm": {
        "base_url": "",
        "api_key": "",
        "model": ""
    },
    "llm_chat": {
        "base_url": "",
        "api_key": "",
        "model": ""
    },
    "llm_image": {
        "base_url": "",
        "api_key": "",
        "model": ""
    }
}
```

Each LLM capability (`vlm`, `chat`, `image`) has its own provider config with independent `base_url`, `api_key`, and `model` fields. The `pipeline_mode` setting controls whether the hybrid or legacy pipeline is used.

Settings updates use a shallow merge strategy: top-level keys are replaced, but nested objects are merged field-by-field so partial updates do not wipe sibling fields.

## Storage

The `storage` module manages the on-disk file layout. On startup, `ensure_dirs` creates these subdirectories under `{data_dir}/`:

| Directory | Purpose |
|-----------|---------|
| `uploads/` | Original uploaded files, saved with UUID filenames |
| `previews/` | 512x512 JPEG previews generated with Lanczos3 resampling |
| `logs/` | Application logs |
| `llm_audit/` | Per-call LLM audit JSON files |
| `pipeline/` | Per-project pipeline artifacts (preprocessed images, VLM responses, scene JSON, validation reports, alignment overlays) |

Uploaded files are saved as `{uuid}.{ext}` in the uploads directory. Previews are generated as `{stem}_preview.{ext}` in the previews directory. Preview generation uses the `image` crate's `Lanczos3` filter at 512x512 resolution and saves as JPEG.

File cleanup on delete removes both the upload and preview files from disk.

## Util

The `util` module provides a single helper:

```rust
pub fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}
```

Generates a 32-character lowercase hex UUID (no dashes) used as the primary key for all database records.
