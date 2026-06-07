---
sidebar_position: 5
title: 后端架构
---

# 后端架构

Planova 后端是一个用 Rust 编写的 Tauri v2 应用。它管理项目状态、文件存储、AI 驱动的户型图解析和 3D 场景生成——全部在用户本机本地运行。

## 模块布局

入口点是 `src-tauri/src/lib.rs`，它初始化数据库、注册共享状态，并向前端暴露约 25 个 Tauri 命令。后端组织为以下模块：

| 模块 | 路径 | 用途 |
|------|------|------|
| `commands` | `src/commands/` | 按领域分组的 Tauri 命令处理器 |
| `db` | `src/db.rs` | SQLite 连接、schema 和 `AppState` |
| `models` | `src/models.rs` | 共享数据结构（`Project`、`UploadedFile` 等） |
| `pipeline` | `src/pipeline/` | 户型图解析和 3D 场景生成 |
| `ai` | `src/ai/` | LLM HTTP 客户端、提示词模板、审计日志 |
| `settings` | `src/settings.rs` | 设置持久化和 LLM 配置解析 |
| `storage` | `src/storage.rs` | 文件上传、预览生成、磁盘 I/O |
| `util` | `src/util.rs` | UUID 生成 |

## 共享应用状态

单个 `AppState` 结构体通过 Tauri 的托管状态系统注册，在所有命令间共享：

```rust
pub struct AppState {
    pub db: Mutex<Connection>,   // rusqlite 连接（WAL 模式，启用 FK）
    pub data_dir: PathBuf,       // 应用数据目录（平台相关）
    pub runtime: tokio::runtime::Runtime, // 专用 Tokio 运行时，用于异步任务
}
```

启动时，应用还会将任何处于 `pending`/`running`/`executing` 状态的任务重置为 `failed`，并将在 `parsing` 状态卡住的文件标记为 `failed`。这防止了之前崩溃或强制退出导致的陈旧状态。

## SQLite 数据库

Planova 使用位于 `{data_dir}/planova.db` 的嵌入式 SQLite 数据库，启用 WAL 日志和外键。Schema 由四张表组成：

### `projects`

| 列 | 类型 | 默认值 | 描述 |
|----|------|--------|------|
| `id` | TEXT | PK | UUID v4（无横线） |
| `name` | TEXT | NOT NULL | 项目显示名称 |
| `description` | TEXT | `''` | 用户提供的描述 |
| `style` | TEXT | `'modern_luxury'` | 室内风格预设 |
| `status` | TEXT | `'draft'` | 项目生命周期状态 |
| `created_at` | TEXT | NOT NULL | ISO 8601 时间戳 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 时间戳 |

### `uploaded_files`

| 列 | 类型 | 默认值 | 描述 |
|----|------|--------|------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | 级联删除 |
| `original_filename` | TEXT | NOT NULL | 原始文件名 |
| `file_type` | TEXT | `''` | MIME 类型或扩展名 |
| `file_size` | INTEGER | `0` | 字节数 |
| `storage_path` | TEXT | `''` | 上传文件的绝对路径 |
| `preview_path` | TEXT | `''` | 512x512 预览的绝对路径 |
| `parse_status` | TEXT | `''` | `'parsing'`、`'failed'` 或空 |
| `created_at` | TEXT | NOT NULL | ISO 8601 时间戳 |

### `generation_tasks`

| 列 | 类型 | 默认值 | 描述 |
|----|------|--------|------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | 级联删除 |
| `task_type` | TEXT | `'floorplan_parse'` | 任务类别 |
| `status` | TEXT | `'pending'` | `'pending'`、`'running'`、`'executing'`、`'completed'`、`'failed'` |
| `progress` | INTEGER | `0` | 0-100 进度百分比 |
| `input_data` | TEXT | nullable | 包含任务输入的 JSON blob |
| `output_data` | TEXT | nullable | 包含任务输出的 JSON blob |
| `error_message` | TEXT | `''` | 失败时的错误详情 |
| `created_at` | TEXT | NOT NULL | ISO 8601 时间戳 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 时间戳 |

### `scenes`

| 列 | 类型 | 默认值 | 描述 |
|----|------|--------|------|
| `id` | TEXT | PK | UUID v4 |
| `project_id` | TEXT | FK -> projects | 级联删除 |
| `file_id` | TEXT | `''` | 来源上传文件 |
| `name` | TEXT | `''` | 场景显示名称 |
| `schema_version` | TEXT | `'0.1.0'` | HomeSceneJSON 版本 |
| `scene_json` | TEXT | nullable | 完整场景 JSON |
| `created_at` | TEXT | NOT NULL | ISO 8601 时间戳 |
| `updated_at` | TEXT | NOT NULL | ISO 8601 时间戳 |

## Commands 模块

Tauri 命令组织在 `src/commands/` 下的六个领域文件中：

**`projects`** -- 项目 CRUD：
- `create_project`、`list_projects`、`get_project`、`update_project`、`delete_project`

**`files`** -- 文件上传和管理：
- `upload_file` -- 通过对话框接受文件字节
- `upload_file_from_base64` -- 接受 base64 编码的内容
- `list_files`、`get_file_preview`、`delete_file`、`save_file`

**`scenes`** -- 场景管理：
- `list_scenes`、`get_scene`、`update_scene`、`delete_scene`

**`tasks`** -- 生成任务生命周期：
- `start_generation` -- 启动解析流水线
- `retry_parse` -- 重新运行失败的解析
- `get_task`、`get_task_by_file`、`cancel_task`
- `get_task_pipeline` -- 返回流水线步骤信息供 UI 使用
- `get_pipeline_artifacts` -- 返回保存的调试产物

**`settings`** -- 用户偏好：
- `get_settings`、`update_settings`、`test_llm_connection`

**`renders`** -- 导出：
- `export_render` -- 触发场景的图像生成

## Pipeline 模块

流水线模块（`src/pipeline/`）将户型图转换为 3D `HomeSceneJSON` 表示。支持两种模式，可通过设置选择。

### Legacy 流水线（7 步）

以 VLM 为核心的流水线，视觉语言模型完成所有工作：

1. **预处理** -- 清洗并归一化输入图像（`preprocess`）
2. **VLM 解析** -- 单次 VLM 调用提取墙体、房间、门、窗和比例（`ai::client::call_vlm`）
3. **归一化** -- 将原始 VLM 输出转换为 HomeSceneJSON（`normalizer`）
4. **修复** -- 修复几何问题（间隙、重叠、无效多边形）（`repair`）
5. **验证** -- 为场景评分并标记问题（`validate`）
6. **叠加** -- 生成调试图像，将检测到的几何体叠加在输入上（`overlay`）
7. **家具** -- LLM 调用规划家具放置（`furniture`）

### Hybrid CV+VLM 流水线（12 步）

两阶段流水线，计算机视觉处理几何信息，VLM 提供语义信息：

1. **预处理** -- 清洗并归一化输入图像（`preprocess`）
2. **墙体蒙版** -- 基于 CV 从图像中提取墙体区域（`wall_mask`）
3. **墙体线段图** -- 从蒙版构建墙体线段图（`wall_graph`）
4. **VLM 语义** -- 使用混合提示词的 VLM 调用：仅提取房间、门、窗和比例（几何信息已由 CV 处理）（`ai::client::call_vlm_hybrid`）
5. **PlanGraph** -- 将 CV 几何信息 + VLM 语义合并为 `PlanGraphJSON`（`plan_graph`）
6. **转换** -- 将 PlanGraphJSON 转换为 HomeSceneJSON（`convert`）
7. **修复** -- 修复几何问题（`repair`）
8. **对齐** -- 计算基于 IoU 的对齐分数，比较 plan graph 与墙体蒙版（`alignment`）
9. **验证** -- 使用对齐感知的验证为场景评分（`validate`）
10. **叠加** -- 生成 VLM 和对齐调试叠加图（`overlay`、`overlay_alignment`）
11. **家具** -- LLM 驱动的家具规划，受质量阈值门控（`furniture`）
12. **保存产物** -- 将所有流水线输出写入磁盘（`pipeline/{project_id}/`）

Hybrid 流水线在 CV 步骤失败（墙体蒙版提取或墙体线段图构建）或检测到少于 3 个墙体线段时回退到 Legacy。家具规划的质量门控要求：几何分数 >= 0.8，比例分数 >= 0.9，图像对齐 >= 0.75，且无用户审核标志。

### 流水线子模块

| 子模块 | 职责 |
|--------|------|
| `preprocess` | 图像清洗和归一化 |
| `wall_mask` | 二值墙体蒙版提取（CV） |
| `wall_graph` | 墙体线段图构建（CV） |
| `plan_graph` | 合并 CV + VLM 为 PlanGraphJSON |
| `convert` | PlanGraphJSON 转 HomeSceneJSON |
| `normalizer` | VLM 输出转 HomeSceneJSON（Legacy 路径） |
| `repair` | 几何修复和间隙修补 |
| `alignment` | 墙体 IoU 对齐评分 |
| `validate` | 场景质量验证 |
| `overlay` | 调试叠加图生成 |
| `overlay_alignment` | 对齐调试叠加图 |
| `furniture` | LLM 家具放置规划 |

## AI 模块

`ai` 模块（`src/ai/`）包含三个子模块：

### `ai::client` -- LLM HTTP 客户端

所有调用都发送到兼容 OpenAI 的 `/chat/completions` 端点，超时 120 秒。客户端支持：

- **`call_vlm`** -- 视觉语言模型调用，用于完整户型图解析。发送图像并使用 `FLOORPLAN_PARSE_SYSTEM` / `FLOORPLAN_PARSE_USER` 提示词。期望 JSON 输出。
- **`call_vlm_hybrid`** -- 使用混合提示词的 VLM 调用（`FLOORPLAN_PARSE_HYBRID_SYSTEM` / `FLOORPLAN_PARSE_HYBRID_USER`）。VLM 仅提供语义信息；几何信息来自 CV。
- **`call_llm_text`** -- 纯文本 LLM 调用，用于家具规划和其他非视觉任务。
- **`call_image_gen`** -- 图像生成，按顺序尝试三种策略：Qwen DashScope 多模态 API、OpenAI DALL-E `/images/generations`，以及带图像输入的 chat completions。

VLM 调用包含重试循环（最多 3 次尝试），在超时错误时以指数退避重试（5s、10s、15s）。

客户端还处理从 LLM 响应中提取 JSON，包括从 markdown 代码围栏和不完整 JSON 片段中解析。

### `ai::prompts` -- 提示词模板

每个流水线阶段的提示词常量，包括系统和用户提示词，用于：
- Legacy 户型图解析
- Hybrid 户型图解析
- 家具规划
- 图像渲染/生成

### `ai::audit` -- 审计日志

每次 LLM 调用（VLM、文本、图像生成）都记录到 `{data_dir}/llm_audit/`，以 JSON 文件形式保存，包含模型、消息、响应、token 用量、延迟和任何错误。

## 设置

设置以 JSON 文件形式存储在 `{data_dir}/settings.json`。默认配置：

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

每种 LLM 能力（`vlm`、`chat`、`image`）都有独立的提供商配置，包含独立的 `base_url`、`api_key` 和 `model` 字段。`pipeline_mode` 设置控制使用 Hybrid 还是 Legacy 流水线。

设置更新使用浅合并策略：顶层键被替换，但嵌套对象按字段合并，使部分更新不会覆盖同级字段。

## 存储

`storage` 模块管理磁盘上的文件布局。启动时，`ensure_dirs` 在 `{data_dir}/` 下创建以下子目录：

| 目录 | 用途 |
|------|------|
| `uploads/` | 原始上传文件，以 UUID 文件名保存 |
| `previews/` | 使用 Lanczos3 重采样生成的 512x512 JPEG 预览 |
| `logs/` | 应用日志 |
| `llm_audit/` | 每次调用的 LLM 审计 JSON 文件 |
| `pipeline/` | 每个项目的流水线产物（预处理图像、VLM 响应、场景 JSON、验证报告、对齐叠加图） |

上传文件以 `{uuid}.{ext}` 格式保存在 uploads 目录。预览以 `{stem}_preview.{ext}` 格式保存在 previews 目录。预览生成使用 `image` crate 的 `Lanczos3` 滤波器，分辨率为 512x512，保存为 JPEG。

删除文件时会同时清理磁盘上的上传文件和预览文件。

## Util

`util` 模块提供一个辅助函数：

```rust
pub fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}
```

生成一个 32 字符的小写十六进制 UUID（无横线），用作所有数据库记录的主键。
