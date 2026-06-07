---
sidebar_position: 1
title: IPC 命令参考
description: 所有 Tauri IPC 命令的完整参考
---

# IPC 命令参考

Planova 使用 Tauri 的 IPC（进程间通信）通过 `invoke()` 从 TypeScript 前端调用 Rust 函数。

```ts
import { invoke } from '@tauri-apps/api/core'

const result = await invoke<ReturnType>('command_name', { param: value })
```

所有命令定义在 `src-tauri/src/commands/` 中，并在 `src-tauri/src/lib.rs` 中注册。

---

## 项目（Projects）

### `create_project`

创建新项目。

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 项目名称 |
| `description` | `string` | 项目描述 |
| `style` | `string` | 室内设计风格键 |

**返回值**：`ProjectResponse`

```ts
const project = await invoke('create_project', {
  name: 'My Apartment',
  description: '3BR floor plan',
  style: 'modern_luxury',
})
```

---

### `list_projects`

列出所有项目，按创建日期降序排列。

| 参数 | 类型 | 说明 |
|------|------|------|
| *（无）* | | |

**返回值**：`ProjectResponse[]`

---

### `get_project`

根据 ID 获取单个项目。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |

**返回值**：`ProjectResponse`

**错误**：`"Project not found"`

---

### `update_project`

更新项目字段。所有字段均为可选 -- 仅更新提供的字段。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |
| `name` | `string?` | 新名称 |
| `description` | `string?` | 新描述 |
| `style` | `string?` | 新风格键 |
| `status` | `string?` | 新状态 |

**返回值**：`ProjectResponse`

---

### `delete_project`

删除项目及其所有关联的文件、场景、任务和流水线产物（从磁盘和数据库中移除）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |

**返回值**：`void`

---

## 文件（Files）

### `upload_file`

从本地文件路径上传文件。如果已配置 LLM API 密钥且文件是有效图片，将自动触发户型图解析。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |
| `file_path` | `string` | 文件在磁盘上的绝对路径 |

**返回值**：`FileResponse`

---

### `upload_file_from_base64`

从 base64 编码字符串上传文件。自动解析行为与 `upload_file` 相同。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |
| `base64_data` | `string` | Base64 编码的文件内容 |
| `filename` | `string` | 原始文件名（用于检测内容类型） |

**返回值**：`FileResponse`

---

### `list_files`

列出项目中所有已上传的文件，按创建日期排序。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |

**返回值**：`FileResponse[]`

---

### `get_file_preview`

获取文件的预览，返回 base64 编码的 data URL。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `string` | 文件 UUID |

**返回值**：`string`（base64）

**错误**：`"File not found"`、`"Preview file not found on disk"`

---

### `delete_file`

从磁盘和数据库中删除文件及其关联的场景。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `string` | 文件 UUID |

**返回值**：`void`

---

### `save_file`

将原始字节保存到磁盘上的任意文件路径。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 输出的绝对路径 |
| `base64_data` | `string` | Base64 编码的文件内容 |

**返回值**：`void`

---

## 场景（Scenes）

### `list_scenes`

列出项目中所有场景。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |

**返回值**：`SceneResponse[]`

---

### `get_scene`

根据 ID 获取单个场景。

| 参数 | 类型 | 说明 |
|------|------|------|
| `scene_id` | `string` | 场景 UUID |

**返回值**：`SceneResponse | null`

---

### `update_scene`

替换现有场景的 `scene_json` 字段。

| 参数 | 类型 | 说明 |
|------|------|------|
| `scene_id` | `string` | 场景 UUID |
| `scene_json` | `object` | 完整的 HomeSceneJSON 对象 |

**返回值**：`SceneResponse`

**错误**：`"Scene not found"`

---

### `delete_scene`

删除场景。

| 参数 | 类型 | 说明 |
|------|------|------|
| `scene_id` | `string` | 场景 UUID |

**返回值**：`void`

---

## 任务（Tasks / Pipeline）

### `start_generation`

为文件启动户型图解析流水线。启动前会验证 LLM 配置和图片有效性。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |
| `file_id` | `string` | 文件 UUID |
| `style` | `string` | 室内设计风格键 |
| `ceiling_height` | `number?` | 层高（米），默认：2.8 |
| `wall_thickness` | `number?` | 墙体厚度（米），默认：0.2 |

**返回值**：`TaskResponse`

**错误**：`"LLM API key not configured"`、`"LLM Base URL not configured"`、`"File not found"`、`"Uploaded file is not a valid image"`

---

### `retry_parse`

为之前失败的文件重新运行解析流水线。启动前会重置文件的解析状态。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `string` | 文件 UUID |

**返回值**：`TaskResponse`

---

### `get_task`

根据 ID 获取任务。

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**返回值**：`TaskResponse`

**错误**：`"Task not found"`

---

### `get_task_by_file`

查找给定文件的活动（pending/running）任务。如果不存在活动任务则返回 `null`。

| 参数 | 类型 | 说明 |
|------|------|------|
| `file_id` | `string` | 文件 UUID |

**返回值**：`TaskResponse | null`

---

### `cancel_task`

取消处于 pending 或 running 状态的任务。将其状态设为 `cancelled`。

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**返回值**：`void`

**错误**：`"Task cannot be cancelled"`（任务已完成/已失败/已取消时）

---

### `get_task_pipeline`

获取任务的流水线元数据和产物 URL。

| 参数 | 类型 | 说明 |
|------|------|------|
| `task_id` | `string` | 任务 UUID |

**返回值**：`object` -- 流水线元数据 JSON，包含 `urls` 字段，指向各产物的相对路径：

```json
{
  "urls": {
    "preprocessed_image": "/pipeline/{project_id}/preprocessed.png",
    "vlm_response": "/pipeline/{project_id}/vlm_response.json",
    "scene_normalized": "/pipeline/{project_id}/scene_normalized.json"
  }
}
```

**错误**：`"Task not found"`、`"Pipeline artifacts not found"`

---

### `get_pipeline_artifacts`

获取项目的所有流水线产物，包括 base64 编码的图片和诊断数据。

| 参数 | 类型 | 说明 |
|------|------|------|
| `project_id` | `string` | 项目 UUID |

**返回值**：`object`

```json
{
  "meta": { },
  "overlay_alignment": "<base64 PNG>",
  "diagnosis": { },
  "wall_mask": "<base64 PNG>",
  "project_id": "..."
}
```

**错误**：`"Pipeline artifacts not found"`

---

## 设置（Settings）

### `get_settings`

读取应用设置文件。

| 参数 | 类型 | 说明 |
|------|------|------|
| *（无）* | | |

**返回值**：`object` -- 完整的设置 JSON。

---

### `update_settings`

将部分设置合并到现有设置文件中。

| 参数 | 类型 | 说明 |
|------|------|------|
| `data` | `object` | 要合并的部分设置 |

**返回值**：`object` -- 更新后的完整设置 JSON。

---

### `test_llm_connection`

测试与 LLM 或图像生成 API 端点的连接。

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider` | `string?` | 能力类型：`"vlm"`（默认）或 `"image"` |
| `config_override` | `object?` | 覆盖 `{ base_url, api_key, model }`，而非从设置中读取 |

**返回值**：`object`

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

对于图像生成 provider，测试会发送一个简单的生成请求。对于 chat/VLM provider，测试会发送一个最小的 chat completion。

---

## 渲染（Renders）

### `export_render`

从 3D 场景截图生成 AI 渲染图像。使用设置中配置的图像生成 provider。

| 参数 | 类型 | 说明 |
|------|------|------|
| `screenshot_base64` | `string` | Base64 编码的截图（可带或不带 `data:image/png;base64,` 前缀） |
| `style` | `string` | 室内设计风格键 |
| `prompt` | `string?` | 自定义渲染提示词（默认使用风格描述） |

**返回值**：`object`

```json
{
  "success": true,
  "render_path": "/path/to/render_20260509_143022.png",
  "render_base64": "<base64 PNG>"
}
```

**错误**：`"Image generation API key not configured"`、`"Image generation Base URL not configured"`、`"Image generation Model not configured"`

**支持的风格**：`modern_luxury`、`cream`、`nordic`、`chinese`、`wabi_sabi`、`industrial`
