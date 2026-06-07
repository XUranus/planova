---
sidebar_position: 2
title: 测试
description: 端到端流水线测试及运行方式
---

# 测试

Planova 的流水线包含端到端测试，使用真实的户型图图片和模拟的 VLM 响应来验证完整的户型图到场景转换流程。

## 测试文件

所有流水线 E2E 测试位于：

```
src-tauri/src/pipeline/test_e2e.rs
```

## 运行测试

在 `src-tauri/` 目录下执行：

```bash
cd src-tauri
cargo test --lib test_pipeline_e2e -- --nocapture
```

`--nocapture` 标志会在运行期间将详细的诊断输出（房间面积、对齐分数、线段数量等）打印到 stdout。

运行所有库测试：

```bash
cargo test --lib
```

## 测试用例

### 1. `test_wall_mask_extraction`

单独测试墙体掩码提取步骤。

**测试内容：**

1. 预处理测试图片（`assets/plane-design-3.png`）。
2. 通过 `wall_mask::extract_wall_mask` 提取二值墙体掩码。
3. 计算墙体像素与总图像像素的比率。

**断言条件：**

| 检查项 | 条件 |
|-------|------|
| 墙体像素比率 | 在 0.5% 到 20% 之间 |
| 标题栏区域 (y &lt; 150) | 墙体像素少于 500 |
| 图例区域 (y > 900) | 墙体像素少于 500 |

这些检查验证掩码能正确识别结构性墙体，同时忽略标注、标题栏和图例。

### 2. `test_wall_graph_segments`

测试从墙体掩码构建墙体骨架图。

**测试内容：**

1. 执行预处理和墙体掩码提取。
2. 通过 `wall_graph::build_wall_graph` 构建墙体骨架图。
3. 检查生成的线段和节点。

**断言条件：**

| 检查项 | 条件 |
|-------|------|
| 线段数量 | 在 3 到 80 之间 |
| 无全跨度线段 | 水平线段不超过图像宽度的 95%；垂直线段不超过图像高度的 95% |
| 无标题栏线段 | 没有线段中点的 y &lt; 150 |
| 无图例线段 | 没有线段中点的 y > 900 |

### 3. `test_full_pipeline_with_mock_vlm`

测试从预处理到场景验证的完整流水线。

**测试内容：**

1. 预处理图像并提取墙体掩码和墙体图。
2. 构造**模拟 VLM 响应**（见下文）。
3. 从墙体线段 + VLM 响应构建 `PlanGraph`。
4. 将 `PlanGraph` 转换为 `HomeSceneJSON` 场景。
5. 执行场景修复（`repair::repair_scene`）。
6. 计算墙体对齐指标（`alignment::compute_alignment`）。
7. 验证最终场景（`validate::validate_scene_with_alignment`）。

**断言条件：**

| 检查项 | 条件 |
|-------|------|
| 面数量 | 至少 2 个 |
| 房间数量 | 至少 2 间 |
| 对齐总分 | 大于 0.5 |
| 包含 `room_refs` 的墙体 | 至少 1 面 |
| 比例尺 mpp（最佳候选） | 在 0.005 到 0.015 之间 |
| 单个房间最大尺寸 | 小于 15 m |
| 总面积 | 在 20 m² 到 100 m² 之间 |

## 模拟 VLM 响应结构

模拟响应模拟 VLM 在接收到户型图图片后返回的内容：

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "centroid": [300, 500],
      "confidence": 0.9
    },
    {
      "type": "bedroom",
      "name": "卧室",
      "centroid": [900, 400],
      "confidence": 0.9
    },
    {
      "type": "bathroom",
      "name": "卫生间",
      "centroid": [900, 700],
      "confidence": 0.9
    }
  ],
  "detected_doors": [
    {
      "position": [700, 400],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "bedroom"],
      "swing_direction": "right_inward",
      "confidence": 0.8
    },
    {
      "position": [700, 700],
      "width_meters": 0.9,
      "connected_rooms": ["living_room", "bathroom"],
      "swing_direction": "right_inward",
      "confidence": 0.8
    }
  ],
  "detected_windows": [
    {
      "position": [300, 200],
      "width_meters": 1.2,
      "wall_side": "north",
      "confidence": 0.7
    },
    {
      "position": [900, 200],
      "width_meters": 1.2,
      "wall_side": "north",
      "confidence": 0.7
    }
  ],
  "scale_info": {
    "detected": true,
    "meters_per_pixel": 0.01
  },
  "dimension_annotations": [
    { "text": "8400", "position": [600, 100], "direction": "horizontal" },
    { "text": "6000", "position": [100, 500], "direction": "vertical" }
  ]
}
```

**关键字段：**

- `detected_rooms` -- 房间标签，包含质心像素坐标和类型。
- `detected_doors` -- 门的位置、宽度（米）、连接的房间和开门方向。
- `detected_windows` -- 窗户的位置、宽度和所在墙面方向。
- `scale_info` -- 初始比例尺估计（米/像素）。
- `dimension_annotations` -- 从户型图图像中 OCR 检测到的尺寸标注（值为毫米）。

## 测试产物

所有测试输出保存到 `/tmp/planova_test/`（完整流水线测试为 `/tmp/planova_test_full/`）。该目录包含：

- `preprocessed.png` -- 预处理后的户型图图像
- `wall_mask.png` -- 二值墙体掩码
- `wall_graph.json` -- 墙体骨架图数据
- `overlay_alignment.png` -- 对齐叠加可视化

该目录会在每次测试运行前自动创建。
