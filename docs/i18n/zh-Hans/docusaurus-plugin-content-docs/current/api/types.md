---
sidebar_position: 2
title: 类型参考
description: Planova 中使用的 TypeScript 和 Rust 类型定义
---

# 类型参考

本页记录了 Planova 中的所有共享数据类型：来自 `src/types/scene.ts` 的 TypeScript 接口和来自 `src-tauri/src/models.rs` 的 Rust 结构体。

---

## HomeSceneJSON

连接户型图解析、AI 规划、3D 生成、渲染和导出的统一数据协议。定义在 `src/types/scene.ts` 中。

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 项目 UUID |
| `name` | `string` | 项目名称 |
| `unit` | `'meter'` | 计量单位（始终为 `"meter"`） |

### HomeSceneGlobal

| 字段 | 类型 | 说明 |
|------|------|------|
| `style` | `string` | 室内设计风格键 |
| `ceiling_height` | `number` | 层高（米） |
| `wall_thickness` | `number` | 墙体厚度（米） |
| `texture_overrides.floor` | `string?` | 地面纹理覆盖路径 |
| `texture_overrides.wall` | `string?` | 墙面纹理覆盖路径 |
| `texture_overrides.ceiling` | `string?` | 天花板纹理覆盖路径 |

### Room

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 房间 UUID |
| `type` | `RoomType` | 房间分类 |
| `name` | `string` | 显示名称 |
| `polygon` | `Vec2[]` | 地面多边形顶点（米） |
| `area` | `number?` | 面积（平方米） |
| `floor_material` | `string?` | 地面材质 ID |
| `wall_material` | `string?` | 墙面材质 ID |
| `ceiling_material` | `string?` | 天花板材质 ID |

### Wall

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 墙体 UUID |
| `start` | `Vec2` | 起点（米） |
| `end` | `Vec2` | 终点（米） |
| `height` | `number` | 墙高（米） |
| `thickness` | `number` | 墙体厚度（米） |
| `material` | `string?` | 材质 ID |
| `room_refs` | `string[]` | 相邻房间的 ID |

### Opening

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 开口 UUID |
| `type` | `OpeningType` | `"door"` 或 `"window"` |
| `wall_ref` | `string` | 所属墙体 ID |
| `position` | `Vec2` | 墙上的中心位置（米） |
| `width` | `number` | 开口宽度（米） |
| `height` | `number` | 开口高度（米） |
| `sill_height` | `number` | 窗台距地面高度（米） |
| `swing` | `DoorSwing?` | 门的开合方向（仅限门） |

### SceneObject

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 物体 UUID |
| `type` | `'furniture' \| 'decoration'` | 物体类别 |
| `category` | `string` | 具体类别（如 `"sofa"`、`"lamp"`） |
| `asset_id` | `string?` | 3D 资源引用 |
| `room_ref` | `string?` | 该物体所属的房间 ID |
| `position` | `Vec3` | 世界坐标位置（米） |
| `rotation` | `Vec3` | 欧拉旋转（弧度） |
| `scale` | `Vec3` | 各轴缩放因子 |
| `size` | `Vec3` | 包围盒尺寸（米） |
| `material_overrides` | `Record<string, string>?` | 按槽位覆盖材质 |

### SceneMaterial

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 材质 UUID |
| `type` | `'pbr'` | 材质模型（始终为 PBR） |
| `name` | `string` | 显示名称 |
| `base_color` | `string` | 十六进制颜色（如 `"#f5f5f5"`） |
| `roughness` | `number` | 表面粗糙度（0-1） |
| `metalness` | `number` | 金属度（0-1） |
| `transparent` | `boolean?` | 材质是否透明 |
| `opacity` | `number?` | 不透明度（0-1） |
| `texture_urls.base_color` | `string?` | 基础颜色贴图 URL |
| `texture_urls.normal` | `string?` | 法线贴图 URL |
| `texture_urls.roughness` | `string?` | 粗糙度贴图 URL |

### SceneLight

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 灯光 UUID |
| `type` | `LightType` | 灯光类型 |
| `name` | `string` | 显示名称 |
| `position` | `Vec3` | 世界坐标位置（米） |
| `rotation` | `Vec3` | 欧拉旋转（弧度） |
| `intensity` | `number` | 灯光强度 |
| `color` | `string` | 十六进制颜色 |
| `size` | `Vec2?` | 面光源尺寸（米） |

### CameraPreset

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 相机 UUID |
| `name` | `string` | 预设名称 |
| `type` | `CameraType` | 相机投影类型 |
| `position` | `Vec3` | 相机位置（米） |
| `target` | `Vec3` | 观察目标点（米） |
| `fov` | `number` | 视场角（度） |

### ParseQuality

| 字段 | 类型 | 说明 |
|------|------|------|
| `overall_score` | `number` | 综合质量分数（0-1） |
| `geometry_score` | `number` | 几何有效性分数 |
| `semantic_score` | `number` | 语义正确性分数 |
| `scale_score` | `number` | 比例尺精度分数 |
| `image_alignment_score` | `number` | 与源图像的对齐分数 |
| `needs_user_review` | `boolean` | 是否建议人工审核 |
| `image_alignment` | `ImageAlignmentReport?` | 详细的对齐指标 |

### ImageAlignmentReport

| 字段 | 类型 | 说明 |
|------|------|------|
| `wall_iou` | `number` | 墙体掩码交并比 |
| `wall_precision` | `number` | 墙体检测精确率 |
| `wall_recall` | `number` | 墙体检测召回率 |
| `overall` | `number` | 综合对齐分数 |

### DiagnosisReport

| 字段 | 类型 | 说明 |
|------|------|------|
| `missing_wall_regions` | `Array<{ bbox: number[], description: string }>` | 预期有墙体但未检测到的区域 |
| `extra_wall_regions` | `Array<{ bbox: number[], description: string }>` | 检测到墙体但不应存在的区域 |
| `scale_suspicious` | `boolean` | 比例尺估计是否可疑 |
| `scale_reason` | `string?` | 比例尺可疑的原因说明 |
| `room_coverage` | `number` | 房间覆盖的图像面积比例 |

---

## 枚举类型

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

## 基本类型别名

```ts
type Vec2 = [number, number]
type Vec3 = [number, number, number]
```

---

## Rust 模型结构体

定义在 `src-tauri/src/models.rs` 中。所有结构体派生了 `Debug`、`Clone`、`Serialize`、`Deserialize`。

### `Project`

| 字段 | 说明 | Rust 类型 |
|------|------|-----------|
| `id` | UUID | `String` |
| `name` | 名称 | `String` |
| `description` | 描述 | `String` |
| `style` | 风格键 | `String` |
| `status` | 状态 | `String` |
| `created_at` | ISO 8601 | `String` |
| `updated_at` | ISO 8601 | `String` |

### `UploadedFile`

| 字段 | 说明 | Rust 类型 |
|------|------|-----------|
| `id` | UUID | `String` |
| `project_id` | 外键 | `String` |
| `original_filename` | 文件名 | `String` |
| `file_type` | MIME 类型 | `String` |
| `file_size` | 字节数 | `i64` |
| `storage_path` | 绝对路径 | `String` |
| `preview_path` | 绝对路径 | `String` |
| `parse_status` | 状态 | `String` |
| `created_at` | ISO 8601 | `String` |

### `GenerationTask`

| 字段 | 说明 | Rust 类型 |
|------|------|-----------|
| `id` | UUID | `String` |
| `project_id` | 外键 | `String` |
| `task_type` | 类型 | `String` |
| `status` | 状态 | `String` |
| `progress` | 0-100 | `i64` |
| `input_data` | JSON | `Option<serde_json::Value>` |
| `output_data` | JSON | `Option<serde_json::Value>` |
| `error_message` | 错误信息 | `String` |
| `created_at` | ISO 8601 | `String` |
| `updated_at` | ISO 8601 | `String` |

---

## API 响应类型

这些是 Tauri IPC 命令返回的类型。它们与数据库模型对应，但排除了 `storage_path` 等内部字段。

### `ProjectResponse`

与 `Project` 字段相同：`id`、`name`、`description`、`style`、`status`、`created_at`、`updated_at`。

### `FileResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 文件 UUID |
| `project_id` | `string` | 父项目 UUID |
| `original_filename` | `string` | 原始文件名 |
| `file_type` | `string` | MIME 类型 |
| `file_size` | `number` | 文件大小（字节） |
| `preview_url` | `string` | Base64 编码的预览 data URL |
| `parse_status` | `string` | `""`、`"parsing"`、`"completed"` 或 `"failed"` |
| `created_at` | `string` | ISO 8601 时间戳 |

### `TaskResponse`

与 `GenerationTask` 字段相同：`id`、`project_id`、`task_type`、`status`、`progress`、`input_data`、`output_data`、`error_message`、`created_at`、`updated_at`。

### `SceneResponse`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 场景 UUID |
| `project_id` | `string` | 父项目 UUID |
| `file_id` | `string` | 源文件 UUID |
| `name` | `string` | 场景名称 |
| `schema_version` | `string` | Schema 版本（如 `"0.1.0"`） |
| `scene_json` | `HomeSceneJSON?` | 解析后的场景 JSON（解析失败时为 null） |
| `created_at` | `string` | ISO 8601 时间戳 |
| `updated_at` | `string` | ISO 8601 时间戳 |

---

## 类型映射：TypeScript 到 Rust

| TypeScript | Rust | 说明 |
|-----------|------|------|
| `string` | `String` | 始终堆分配 |
| `number` | `i64` / `f64` | `i64` 用于计数和进度，`f64` 用于坐标 |
| `boolean` | `bool` | |
| `T \| null` | `Option<T>` | 序列化为 `null` 或省略 |
| `T[]` | `Vec<T>` | JSON 数组 |
| `object` | `serde_json::Value` | 任意 JSON（scene_json、input/output data） |
| `Record<string, string>` | `HashMap<String, String>` | 键值映射 |
| `Vec2` = `[number, number]` | `[f64; 2]` | 固定长度数组 |
| `Vec3` = `[number, number, number]` | `[f64; 3]` | 固定长度数组 |
