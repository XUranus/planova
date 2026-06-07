---
sidebar_position: 5
title: PlanGraph 构建
---

# PlanGraph 构建

**模块**：`src-tauri/src/pipeline/plan_graph.rs`
**函数**：`build_plan_graph(wall_graph, vlm_response, image_width, image_height) -> PlanGraphJSON`

PlanGraph 阶段将 CV 墙段与 VLM 语义数据合并为统一的中间表示，称为 PlanGraphJSON。这是 Hybrid 流水线的核心数据结构。

## 数据结构

```rust
pub struct PlanGraphJSON {
    pub wall_segments: Vec<WallSegment>,   // CV-extracted walls
    pub faces: Vec<Face>,                   // Room polygons
    pub labels: Vec<RoomLabel>,             // VLM room labels
    pub doors: Vec<DoorCandidate>,          // VLM doors
    pub windows: Vec<WindowCandidate>,      // VLM windows
    pub scale_candidates: Vec<ScaleCandidate>, // Scale estimates
    pub alignment_scores: Option<AlignmentScores>,
    pub source: String,                     // "hybrid_cv_vlm" or "vlm_only"
}
```

## 墙段

CV 墙段直接从 WallGraphResult 转换而来：

```rust
WallSegment {
    id: seg.id.clone(),           // "cv_wall_1"
    start: seg.start,             // [x, y] in pixels
    end: seg.end,                 // [x, y] in pixels
    thickness_px: 3.0,            // default thickness
    source: "cv_mask".into(),
    confidence: seg.confidence,
}
```

## 房间标签提取

标签从 VLM 响应的 `detected_rooms` 数组中提取。支持两种格式：

1. **多边形格式**（Legacy VLM）：房间有 `polygon` 字段，质心从中计算
2. **质心格式**（Hybrid VLM）：房间直接有 `centroid` 字段

```rust
pub struct RoomLabel {
    pub id: String,           // "label_1"
    pub room_type: String,    // "living_room"
    pub name: String,         // "客厅"
    pub centroid: [f64; 2],   // [x, y] in pixels
    pub confidence: f64,
    pub source: String,       // "vlm"
}
```

## 房间面生成

面是房间的多边形表示。系统使用三级回退策略：

### 第 1 级：VLM 多边形（优先）

如果 VLM 响应包含房间的 `polygon` 数组，则直接用作面。这是质量最高的来源。

### 第 2 级：墙格拓扑

如果没有 VLM 多边形但存在标签和墙段，系统从墙体位置生成面：

```rust
fn generate_faces_from_walls(labels, wall_segments, image_width, image_height)
```

**算法**：

1. **收集 X 坐标** -- 从垂直墙段（`|dx| < |dy|` 且长度 &gt;= 50px 的段）
2. **收集 Y 坐标** -- 从水平墙段（`|dy| < |dx|` 且长度 &gt;= 50px 的段）
3. **吸附邻近坐标** -- 20px 范围内（取平均值）
4. **添加图像边界**作为边界坐标
5. **形成网格单元** -- 从 X 和 Y 分隔数组
6. **分配每个单元**到最近的房间质心（欧氏距离）
7. **确保覆盖**：如果某个标签没有单元，重新分配距其质心最近的单元
8. **合并每个标签的单元**为一个多边形（所有拥有单元的边界框）
9. **裁剪**到墙体边界框

```
Grid formation example:

    X dividers: [100, 300, 500, 700]
    Y dividers: [50, 250, 450]

    Cells:
    +--------+--------+--------+
    | cell   | cell   | cell   |
    | (0,0)  | (1,0)  | (2,0)  |
    +--------+--------+--------+
    | cell   | cell   | cell   |
    | (0,1)  | (1,1)  | (2,1)  |
    +--------+--------+--------+

    Each cell assigned to nearest room centroid.
```

### 第 3 级：质心细分

如果墙格拓扑失败（分隔线太少），回退到纯质心细分：

```rust
fn generate_faces_from_centroids(labels, wall_segments)
```

**算法**：

1. **按 X 坐标聚类质心**（容差 50px）
2. **从左到右排序聚类**
3. **对每个聚类**：
   - 如果是单个房间：跨越墙体边界框的完整高度
   - 如果是多个房间：按相邻质心之间的 Y 中点垂直细分
4. **计算 X 边界**作为聚类中心之间的中点

```
Centroid subdivision example:

    Labels: A(200,300), B(200,500), C(600,400)

    X clusters: [A,B] at x~200, [C] at x~600

    +----------+----------+
    |          |          |
    |    A     |          |
    |          |    C     |
    +----------+          |
    |          |          |
    |    B     |          |
    |          |          |
    +----------+----------+
```

### 回退：从边界框生成单个房间

如果所有面生成方式都失败但存在墙段，则从墙体边界框生成一个带 20px 边距的矩形面。

## 开口绑定

VLM 提取的门窗吸附到最近的 CV 墙段：

```rust
fn snap_openings_to_walls(doors, windows, wall_segments, labels, max_snap_distance: 120.0)
```

对于每个开口：
1. 找到距任何墙段最近的点
2. 如果距离 &lt;= 120px，将开口位置吸附到该点
3. 如果距离 &gt; 120px，将置信度降低 50%（最低 0.3）
4. 过滤无效的房间引用（标签中不存在的房间名称）
5. 根据最近墙体的方向更新窗户的 `wall_side`

## 比例提取

系统收集多个比例候选值并选择置信度最高的：

```rust
pub struct ScaleCandidate {
    pub meters_per_pixel: f64,
    pub source_text: String,
    pub confidence: f64,
}
```

### 来源 1：VLM scale_info（置信度：0.4-0.8）

来自 VLM 响应的 `scale_info.meters_per_pixel`。如果 `detected=true` 且结果尺寸合理（每轴 0.5-20m），置信度为 0.8，否则为 0.2-0.4。

### 来源 2：整体尺寸（置信度：0.75）

来自 `overall_dimensions.width_pixels` 和 `width_meters`。计算 `meters_per_pixel = width_meters / width_pixels`。

### 来源 3：尺寸标注（置信度：0.9）

将 VLM 报告的尺寸标注与 CV 墙体边界框范围进行交叉验证：

```rust
// For each annotation like "3600" (horizontal):
let dim_m = 3600.0 / 1000.0;  // 3.6m
let extent_px = wall_bbox_width;  // e.g., 480px
let mpp = dim_m / extent_px;  // 0.0075
```

使用所有有效标注的平均 `meters_per_pixel`。这是置信度最高的来源，因为它使用了平面图上的具体数字。

### 来源 4：CV 墙体范围回退（置信度：0.45）

假设最长墙体范围代表约 8 米的典型住宅尺寸：

```rust
let cv_mpp = 8.0 / max_extent_px;
```

仅在结果尺寸合理时使用（每轴 1-20m）。

### 比例选择

下游的 `convert::convert_plan_graph_to_scene()` 函数选择置信度值最高的候选。

## Source 字段

`source` 字段表示几何质量：

- `"hybrid_cv_vlm"` -- 检测到 3 条以上 CV 墙段
- `"vlm_only"` -- CV 段少于 3 条（质量降低）

## 输出示例

```json
{
  "wall_segments": [
    {
      "id": "cv_wall_1",
      "start": [100.0, 50.0],
      "end": [800.0, 50.0],
      "thickness_px": 3.0,
      "source": "cv_mask",
      "confidence": 0.8
    }
  ],
  "faces": [
    {
      "id": "face_1",
      "polygon": [[100.0, 50.0], [450.0, 50.0], [450.0, 400.0], [100.0, 400.0], [100.0, 50.0]],
      "area_px": 122500.0,
      "label_ref": "label_1",
      "source": "wall_grid"
    }
  ],
  "labels": [
    {
      "id": "label_1",
      "room_type": "living_room",
      "name": "客厅",
      "centroid": [275.0, 225.0],
      "confidence": 0.9,
      "source": "vlm"
    }
  ],
  "doors": [
    {
      "id": "door_1",
      "position": [300.0, 50.0],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "kitchen"],
      "swing_direction": "left_inward",
      "confidence": 0.8
    }
  ],
  "windows": [],
  "scale_candidates": [
    {
      "meters_per_pixel": 0.0075,
      "source_text": "dimension_annotations",
      "confidence": 0.9
    }
  ],
  "alignment_scores": null,
  "source": "hybrid_cv_vlm"
}
```

保存到 `data/pipeline/{project_id}/plan_graph.json`。
