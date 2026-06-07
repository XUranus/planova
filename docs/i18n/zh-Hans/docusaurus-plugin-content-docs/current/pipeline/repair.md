---
sidebar_position: 7
title: 几何修复
---

# 几何修复

**模块**: `src-tauri/src/pipeline/repair.rs`
**函数**: `repair_scene(scene: &mut Value) -> Vec<String>`

修复阶段在验证之前自动修复 VLM 输出中的常见几何问题。它对米制坐标的 HomeSceneJSON 进行操作，并返回所有已执行修复操作的日志。

## 修复操作

### 房间多边形修复

| 操作 | 描述 | 阈值 | 实现方式 |
|------|------|------|----------|
| 退化房间移除 | 移除面积 &lt; 0.5 m^2 的房间 | `MIN_ROOM_AREA = 0.5` | `rooms.retain()` |
| 顶点吸附 | 将临近顶点吸附到共享坐标 | `SNAP_THRESHOLD = 0.05`（5cm） | 基于网格的吸附映射 |
| 正交化 | 将接近水平/垂直的边缘对齐为精确的水平/垂直方向 | `ORTHO_THRESHOLD_DEG = 10.0` | 边缘角度分析 |
| 闭合修复 | 如果多边形未闭合则追加第一个点 | 1mm 间隙容差 | 距离检查 |
| 重叠检测 | 检测并标记房间多边形重叠 | 50% 顶点包含 | 点在多边形内测试 |

#### 顶点吸附

从所有房间的多边形顶点构建空间网格。彼此距离在 5cm 以内的顶点被吸附到它们的平均位置：

```rust
fn build_snap_map(points, threshold: 0.05)
// Grid cell size = threshold * 1000 (5cm -> 50 units)
// Points in the same cell -> snap to centroid
```

这确保相邻房间之间的共享墙体具有完全匹配的坐标。

#### 正交化

对于每条多边形边缘，检查其角度是否在水平或垂直方向 10 度以内。如果任何边缘需要校正，则对所有边缘进行吸附：

- 如果 `|dx| > |dz|`：吸附到水平方向（保留 X，将 Z 设置为起点的 Z）
- 如果 `|dz| >= |dx|`：吸附到垂直方向（保留 Z，将 X 设置为起点的 X）

#### 闭合修复

检查多边形的第一个和最后一个点之间的距离是否超过 1mm。如果是，则追加第一个点的副本。

#### 重叠检测

对于每对房间，检查一个房间超过 50% 的顶点是否落在另一个房间的多边形内。重叠会被标记但不会自动解决（可能需要人工审查）。

### 墙体修复

| 操作 | 描述 | 阈值 | 实现方式 |
|------|------|------|----------|
| 端点吸附 | 将临近的墙体端点吸附到共享坐标 | `WALL_SNAP_THRESHOLD = 0.05`（5cm） | 同样的基于网格的吸附映射 |
| 共线合并 | 合并共线且临近的墙体段 | 角度 &lt; 5 度，距离 &lt; 10cm | 基于投影的合并 |
| room_refs 修复 | 基于墙体-多边形边缘匹配修复 room_refs | 中点距离 &lt; 30cm，长度比 > 0.5 | 边缘邻近检查 |

#### 共线合并

两面墙可以合并的条件：
1. 角度差 &lt; 5 度（`COLLINEAR_ANGLE_THRESHOLD_DEG`）
2. 一面墙的端点到另一面墙的线的距离在 10cm 以内（`COLLINEAR_DIST_THRESHOLD`）

合并后的墙跨越公共方向上的两个最远端点：

```rust
fn merge_collinear_walls(walls) {
    // For each pair (i, j):
    //   1. Check angle similarity
    //   2. Check point-to-segment distance
    //   3. Project all 4 endpoints onto the common direction
    //   4. Take the two extreme points as the new wall
    //   5. Mark j for removal
}
```

#### room_refs 修复

对于每面墙，查找其多边形边缘与该墙接近的房间：

```rust
fn fix_wall_room_refs(wall, rooms) -> bool
```

对于每个房间多边形边缘：
1. 计算墙体中点和边缘中点
2. 计算中点距离
3. 计算长度比（较短/较长）
4. 如果中点距离 &lt; 30cm 且长度比 > 0.5，则该房间匹配

如果匹配的房间与当前 `room_refs` 不同，则更新该墙体。

### 开口修复

| 操作 | 描述 | 阈值 |
|------|------|------|
| 重新绑定 | 将开口重新绑定到最近的墙 | `wall_thickness * 2` |

对于每扇门和窗：
1. 使用点到线段的距离找到最近的墙
2. 如果最近的墙与当前 `wall_ref` 不同且距离 &lt;= `wall_thickness * 2`，则重新绑定

## 常量汇总

| 常量 | 值 | 用途 |
|------|-----|------|
| `SNAP_THRESHOLD` | 0.05m（5cm） | 房间顶点吸附 |
| `ORTHO_THRESHOLD_DEG` | 10.0 度 | 边缘正交化 |
| `MIN_ROOM_AREA` | 0.5 m^2 | 退化房间移除 |
| `WALL_SNAP_THRESHOLD` | 0.05m（5cm） | 墙体端点吸附 |
| `COLLINEAR_DIST_THRESHOLD` | 0.1m（10cm） | 共线墙体合并 |
| `COLLINEAR_ANGLE_THRESHOLD_DEG` | 5.0 度 | 共线墙体合并 |

## 修复日志输出

返回一个 `Vec<String>` 格式的可读修复操作列表：

```
removed 1 degenerate room(s) with area < 0.5 m^2
snapped 18 polygon vertex/vertices to nearby points
orthogonalized 3 room polygon(s)
closed 1 unclosed polygon(s)
detected 1 room overlap(s) -- may need manual review
snapped 6 wall endpoint(s)
merged 2 collinear wall segment(s)
fixed room_refs for 4 wall(s)
rebound 1 opening(s) to closer wall
```

保存到 `data/pipeline/{project_id}/repair_log.json`。

## 实现细节

### 用于吸附的空间网格

吸附映射使用基于网格的空间哈希进行高效的邻居查找：

```rust
fn build_snap_map(points, threshold) -> HashMap<(i64, i64), [f64; 2]> {
    let grid = (threshold * 1000.0) as i64;  // 5cm -> 50
    // Each point maps to a cell: (x*1000/grid, y*1000/grid)
    // Points in the same cell -> snap to their centroid
}
```

### 点在多边形内测试

使用射线投射算法进行重叠检测：

```rust
fn point_in_polygon(point, polygon) -> bool {
    // Cast a ray from the point and count edge crossings
    // Odd crossings = inside, even = outside
}
```

### 执行顺序

修复按固定顺序运行：先处理房间，然后是墙体，最后是开口。这确保墙体修复可以引用已修复的房间多边形，开口修复可以引用已修复的墙体。

## 何时会触发修复

| VLM 质量 | 预期修复 |
|----------|----------|
| 高（清晰的墙体、准确的标签） | 少量顶点吸附，可能 1-2 次合并 |
| 中等（存在一些模糊） | 顶点吸附、正交化、闭合修复 |
| 低（墙体模糊、需要猜测） | 大量吸附、退化移除、重叠警告 |
