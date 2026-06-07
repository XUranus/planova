---
sidebar_position: 8
title: 质量验证
---

# 质量验证

**模块**: `src-tauri/src/pipeline/validate.rs`
**函数**: `validate_scene()`, `validate_scene_with_alignment()`

验证阶段对修复后的场景进行全面的质量检查，并生成包含评分、错误和警告的验证报告。

## 验证检查

### 房间检查

| 规则 | 严重性 | 描述 |
|------|--------|------|
| 多边形点数 &gt;= 3 | 错误 | 退化多边形 |
| 多边形闭合 | 错误 | 首尾点距离 > 1cm |
| 无 NaN/Inf 坐标 | 错误 | 无效的坐标值 |
| 面积 &gt;= 0.5 m^2 | 错误 | 房间过小 |
| 长宽比 &lt;= 20:1 | 警告 | 极端长宽比 |
| 无自相交 | 警告 | 多边形边缘可能交叉 |
| 卧室面积 &gt;= 3 m^2 | 警告 | 卧室过小 |
| 浴室面积 &lt;= 30 m^2 | 警告 | 浴室异常偏大 |

### 墙体检查

| 规则 | 严重性 | 描述 |
|------|--------|------|
| 长度 &gt;= 5cm | 警告 | 墙段过短 |
| room_refs 非空 | 警告 | 孤立墙体（未关联到任何房间） |

### 开口检查

| 规则 | 严重性 | 描述 |
|------|--------|------|
| wall_ref 存在 | 错误 | 开口未绑定到任何墙 |
| wall_ref 有效 | 错误 | 引用了不存在的墙 |
| 门宽度 0.5-2.0m | 警告 | 异常的门宽度 |
| 窗宽度 0.2-4.0m | 警告 | 异常的窗宽度 |

### 比例检查

| 规则 | 严重性 | 描述 |
|------|--------|------|
| 总范围 &gt;= 2m | 警告 | 比例可能有误（过小） |
| 总范围 &lt;= 50m | 警告 | 比例可能有误（过大） |

## 评分计算

### 总分

```rust
let score = (1.0 - error_count * 0.15 - warning_count * 0.05).max(0.0).min(1.0);
```

每个错误降低 0.15 分，每个警告降低 0.05 分。限制在 [0, 1] 范围内。

### 子评分

#### geometry_score

基于房间/墙体/开口数量的启发式评分：

```rust
fn compute_geometry_score(scene) -> f64 {
    let mut score = 0.5;           // base for having rooms
    if walls > 0 { score += 0.2; }
    if openings > 0 { score += 0.15; }
    if walls >= rooms { score += 0.15; }
    score.min(1.0)
}
```

| 组成部分 | 分值 |
|----------|------|
| 有房间 | 0.5 |
| 有墙体 | +0.2 |
| 有开口 | +0.15 |
| 墙体数 &gt;= 房间数 | +0.15 |

#### semantic_score

基于房间命名和类型标注的完整性：

```rust
fn compute_semantic_score(scene) -> f64 {
    let name_ratio = named_rooms / total_rooms;
    let type_ratio = typed_rooms / total_rooms;
    (name_ratio * 0.5 + type_ratio * 0.5).min(1.0)
}
```

- `named_rooms`：名称不以 "Room " 开头的房间
- `typed_rooms`：类型不是默认值 "living_room" 的房间

#### scale_score

基于房间面积是否在合理范围内：

```rust
fn compute_scale_score(scene) -> f64 {
    // Rooms with area 1-100 m^2 are "reasonable"
    reasonable_count / total_rooms_with_area
}
```

#### image_alignment_score

在混合模式下，来自 `alignment.rs` 模块的对齐评分。在传统模式下默认为 1.0。

## 图像对齐（混合管线）

**模块**: `src-tauri/src/pipeline/alignment.rs`
**函数**: `compute_alignment(wall_mask_path, plan_graph, image_width, image_height, pipeline_dir)`

使用基于 BFS 的距离变换将 CV 墙体掩码与渲染的 PlanGraph 几何体进行比较。

### 算法

1. **渲染细线段**：将 PlanGraph 墙段和面多边形边缘绘制为 1px 线条
2. **从线段计算 BFS 距离**：计算每个像素到最近线段像素的距离
3. **从掩码计算 BFS 距离**：计算每个像素到最近掩码像素的距离
4. **容差**：5 像素（典型墙宽的一半）

### 指标

| 指标 | 定义 | 公式 |
|------|------|------|
| wall_recall | 被线段覆盖的掩码像素比例 | `mask_covered / mask_count` |
| wall_precision | 被掩码覆盖的线段像素比例 | `seg_valid / seg_count` |
| wall_iou | 交并比 | `both_covered / either_covered` |
| overall | 加权组合 | `0.3 * precision + 0.5 * recall + 0.2 * iou` |

召回率权重最高（0.5），因为遗漏墙体比多余墙体更严重。

### 对齐报告

```rust
pub struct AlignmentScores {
    pub wall_iou: f64,
    pub wall_precision: f64,
    pub wall_recall: f64,
    pub overall: f64,
}
```

## 审查门控

`needs_user_review` 标志在以下情况下设置：

```rust
let needs_user_review = error_count > 0.0 || image_alignment_score < 0.75;
```

注意：如果对齐度良好，仅警告不会触发审查。这可以防止因中心细分伪影（孤立墙体）导致的误报。

### 混合管线质量门控

在混合管线中，家具规划受质量门控：

```rust
let should_plan_furniture = pq.geometry_score >= 0.8
    && pq.scale_score >= 0.9
    && pq.image_alignment_score >= 0.75
    && !pq.needs_user_review;
```

如果任何条件不满足，则跳过家具规划，以避免在解析错误的房间中放置家具。

## 验证报告输出

```json
{
  "valid": true,
  "score": 0.85,
  "errors": [],
  "warnings": [
    {
      "type": "small_bedroom",
      "message": "Bedroom '次卧' is only 2.8 m^2",
      "ids": ["room_3"]
    }
  ],
  "repair_actions": [
    "snapped 18 polygon vertex/vertices to nearby points",
    "closed 1 unclosed polygon(s)"
  ],
  "parse_quality": {
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "image_alignment_score": 0.82,
    "needs_user_review": false
  },
  "image_alignment": {
    "wall_iou": 0.71,
    "wall_precision": 0.88,
    "wall_recall": 0.76,
    "overall": 0.82
  }
}
```

`image_alignment` 字段仅在混合模式下存在。

## 前端集成

验证完成后，`parse_quality` 会被注入到 HomeSceneJSON 中：

```json
{
  "rooms": [...],
  "walls": [...],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "image_alignment_score": 0.82,
    "needs_user_review": false,
    "image_alignment": {
      "wall_iou": 0.71,
      "wall_precision": 0.88,
      "wall_recall": 0.76,
      "overall": 0.82
    }
  }
}
```

前端 `SceneInspector` 组件显示：
- **评分进度条** -- 颜色编码：绿色（&gt;= 80%）、黄色（&gt;= 50%）、红色（&lt; 50%）
- **状态图标** -- 绿色对勾或黄色警告三角
- **子评分** -- 几何、语义、比例、对齐
- **对齐叠加层** -- CV 掩码与 PlanGraph 几何体的可视化对比

## 调试产物

| 文件 | 描述 |
|------|------|
| `validation_report.json` | 完整的验证报告 |
| `rendered_structure_mask.png` | 渲染为二值掩码的 PlanGraph 几何体 |
| `overlay_alignment.png` | 颜色编码的对齐可视化（绿色=匹配，红色=缺失，蓝色=多余） |
