---
sidebar_position: 6
title: 数据标准化
---

# 数据标准化

**模块**: `src-tauri/src/pipeline/normalizer.rs`
**函数**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> Value`

标准化阶段将原始 VLM 输出（像素坐标）转换为完整的 HomeSceneJSON（米制坐标），并包含材质、相机和灯光信息。在传统管线中，这是主要的转换步骤。在混合管线中，像素到米制的转换由 `convert.rs` 模块处理，但两者共享标准化模块中的材质、相机和灯光生成函数。

## 处理步骤

### 1. 比例确定

从 VLM 响应中提取 `meters_per_pixel`：

```rust
let meters_per_pixel = scale_info
    .get("meters_per_pixel")
    .and_then(|v| v.as_f64())
    .unwrap_or(0.02);  // default fallback
```

如果 `scale_info.detected` 为 false，则通过比较所有房间多边形的像素边界框与报告的米制尺寸来估算比例：

```rust
fn estimate_scale_from_bbox(rooms, overall) -> f64 {
    // pixel_width from room polygon bounds
    // real_width from overall_dimensions.width_meters
    meters_per_pixel = real_width / pixel_width
}
```

### 2. 房间转换（像素到米）

每个房间的多边形坐标乘以 `meters_per_pixel` 并四舍五入到 3 位小数：

```rust
let x_m = (x_px * meters_per_pixel * 1000.0).round() / 1000.0;
let y_m = (y_px * meters_per_pixel * 1000.0).round() / 1000.0;
```

转换后使用鞋带公式重新计算面积。

**每个房间的输出**：
```json
{
  "id": "room_1",
  "type": "living_room",
  "name": "客厅",
  "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
  "area": 18.13
}
```

### 3. 墙体生成

如果 VLM 返回了墙体信息，则将其转换为米制单位。否则，根据房间多边形的边缘自动生成墙体：

```rust
fn generate_walls_from_rooms(rooms, thickness, height)
```

遍历每个房间的多边形边缘，为每条唯一边缘创建一面墙。使用标准化键（较小端点在前）进行边缘去重，确保相邻房间之间的共享墙体只创建一次。

**每面墙的格式**：
```json
{
  "id": "wall_1",
  "start": [1.0, 1.666],
  "end": [4.833, 1.666],
  "height": 2.8,
  "thickness": 0.2,
  "room_refs": ["room_1", "room_2"]
}
```

### 4. 开口绑定

门和窗被转换为米制单位并绑定到最近的墙：

```rust
fn find_nearest_wall(point, walls) -> wall_id
```

使用点到线段的距离找到最近的墙，然后将其 ID 分配为 `wall_ref`。

**门格式**：
```json
{
  "id": "door_1",
  "type": "door",
  "wall_ref": "wall_1",
  "position": [2.083, 1.666],
  "width": 0.9,
  "height": 2.1,
  "sill_height": 0,
  "swing": "left_inward"
}
```

**窗格式**：
```json
{
  "id": "window_1",
  "type": "window",
  "wall_ref": "wall_3",
  "position": [1.0, 0.833],
  "width": 1.2,
  "height": 1.2,
  "sill_height": 0.9
}
```

### 5. 材质生成

根据所选风格生成 PBR 材质。可用风格：

| 风格 | 描述 |
|------|------|
| `modern_luxury` | 深色木地板、暖灰色墙壁、深色门 |
| `cream` | 浅奶白色墙壁、暖色木地板 |
| `nordic` | 浅灰色墙壁、浅色木地板、极简美学 |

每种风格定义了以下材质：墙壁、天花板、门、窗和地板（按房间类型区分）。

```json
{
  "id": "mat_modern_luxury_wall",
  "type": "pbr",
  "name": "modern_luxury Wall",
  "base_color": "#C8C0B8",
  "roughness": 0.85,
  "metalness": 0.0
}
```

地板材质按房间类型区分。例如，`modern_luxury` 风格的地板：

| 房间类型 | 颜色 | 粗糙度 |
|----------|------|--------|
| living_room | `#6B4F3A`（深色木纹） | 0.6 |
| bedroom | `#7A6050`（中等木纹） | 0.65 |
| kitchen | `#8A8078`（石材） | 0.5 |
| bathroom | `#A0A0A0`（瓷砖） | 0.3 |
| balcony | `#9A9088`（混凝土） | 0.4 |

### 6. 相机生成

生成一个全局俯视相机和每个房间的室内相机：

**俯视相机**：
```json
{
  "id": "cam_overview",
  "name": "Overview",
  "type": "perspective",
  "position": [cx, extent * 0.8, cz + extent],
  "target": [cx, 0, cz],
  "fov": 50
}
```

位于场景中心上方偏后的位置，俯视地面。

**每个房间的相机**：
```json
{
  "id": "cam_room_1",
  "name": "客厅",
  "type": "perspective",
  "position": [rcx - 1.5, 1.6, rcz - 1.5],
  "target": [rcx, 1.2, rcz],
  "fov": 65
}
```

位于房间中心附近的眼睛高度（1.6m），略微向下看。

### 7. 灯光生成

为每个房间生成一盏灯，位于天花板高度减去 0.15m 处：

```rust
let light_y = ceiling_height - 0.15;
```

| 房间类型 | 灯光类型 | 强度 | 颜色 |
|----------|----------|------|------|
| living_room, bedroom | area | 500 | `#fff4e6`（暖色调） |
| 其他房间 | point | 350 | `#ffffff`（中性白光） |

面光源包含 `size: [1.5, 1.5]` 字段，用于柔和阴影渲染。

```json
{
  "id": "light_room_1",
  "type": "area",
  "name": "客厅 Light",
  "position": [3.0, 2.65, 3.0],
  "rotation": [0, 0, 0],
  "intensity": 500,
  "color": "#fff4e6",
  "size": [1.5, 1.5]
}
```

## 输出 (HomeSceneJSON)

```json
{
  "schema_version": "0.1.0",
  "project": {
    "id": "proj_abc123",
    "name": "Untitled",
    "unit": "meter"
  },
  "global": {
    "style": "modern_luxury",
    "ceiling_height": 2.8,
    "wall_thickness": 0.2
  },
  "rooms": [...],
  "walls": [...],
  "openings": [...],
  "objects": [],
  "materials": [...],
  "lights": [...],
  "cameras": [...]
}
```

保存到 `data/pipeline/{project_id}/scene_normalized.json`。

## 混合管线的差异

在混合管线中，`convert.rs` 模块使用来自 PlanGraphJSON 的最佳 `ScaleCandidate` 来处理像素到米的转换。然后调用标准化模块的共享函数生成材质、相机和灯光：

```rust
let materials = normalizer::generate_materials(style, &rooms);
let cameras = normalizer::generate_cameras(&rooms, ceiling_height);
let lights = normalizer::generate_lights(&rooms, ceiling_height);
```

混合转换器还会直接将 `floor_material`、`wall_material` 和 `ceiling_material` 引用分配给每个房间，而传统标准化器则在单独的步骤中通过 `patch_room_materials()` 来补充这些信息。
