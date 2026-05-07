# 平面图 AI 解析管线

## 概述

Planova 将一张户型平面图（JPG/PNG）自动转化为可漫游的 3D 室内模型。整个管线分为 7 个阶段：

```
原始图片 → [预处理] → [VLM 解析] → [数据规范化] → [几何修复] → [质量校验] → [调试叠加层] → [家具规划] → [3D 渲染]
```

每个阶段的中间产物保存在 `data/pipeline/{project_id}/` 目录下，便于调试。

---

## 阶段 1：图像预处理

**模块**: `src-tauri/src/pipeline/preprocess.rs`
**函数**: `preprocess_floor_plan(input_path: &str) -> Result<String, String>`

### 处理步骤

1. **旋转校正** — 使用 Canny 边缘检测 + Hough 直线检测，找到主导线条角度，纠正 ±5° 以内的倾斜
2. **裁剪白边** — 二值化 + 膨胀操作找到内容区域，裁掉大面积白色边框，保留 20px 内边距
3. **尺寸限制** — 如果最长边超过 2048px，等比缩放

### 输入

原始户型图片，例如：

```
data/uploads/project_abc/floorplan.jpg   (3000x2000, 2.5MB)
```

### 输出

预处理后的临时文件路径：

```
/tmp/planova_processed_xxx.jpg           (1800x1200, ~800KB)
```

同时复制到 `data/pipeline/{project_id}/preprocessed.jpg`。

---

## 阶段 2：VLM 多模态解析

**模块**: `src-tauri/src/ai/client.rs`
**函数**: `call_vlm(image_path: &str, config: &LLMConfig, data_dir: &Path) -> Result<Value, String>`

### 处理步骤

1. 将预处理后的图片 Base64 编码
2. 构造 OpenAI 兼容的 Vision API 请求（system prompt + 图片）
3. 调用多模态 LLM（支持配置：`mimo-v2.5`、`mimo-v2-pro` 等）
4. 从模型回复中提取 JSON（支持 markdown 代码块、推理模型的 reasoning_content 等格式）

### System Prompt 关键指令

```
几何规则：
- 坐标必须是图片像素值（不是米）
- 沿实际墙体线条描摹房间轮廓（不要生成通用矩形）
- 房间多边形必须闭合（最后一个坐标等于第一个坐标）
- 墙线必须水平或垂直，不允许对角线
- 相邻房间共享墙时，共享边的坐标必须完全一致
- 房间多边形不能重叠

语义规则：
- 中文标签映射：客厅=living_room, 卧室=bedroom, 厨房=kitchen, 卫生间=bathroom...
- 查找尺寸标注（如 1800、3600）确定比例尺
- 门 = 弧线+直线符号；窗 = 墙体中的平行线

墙体-房间关系：
- 每面墙必须有 room_refs 数组，列出它所属的房间
- 内墙连接 2 个房间，外墙连接 1 个房间

置信度校准：
- >= 0.8：能清晰看到墙线和房间边界
- 0.5-0.8：边界部分可见或模糊
- < 0.5：在猜测 — 不确定时标记低置信度
```

### 输入

预处理后的平面图 + 文本指令。

### 输出（VLM 原始 JSON）

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "polygon": [[120, 200], [580, 200], [580, 520], [120, 520], [120, 200]],
      "confidence": 0.92
    }
  ],
  "detected_walls": [
    {"start": [120, 0], "end": [900, 0], "room_refs": ["room_1"], "confidence": 0.95}
  ],
  "detected_doors": [
    {
      "position": [250, 200],
      "width_meters": 0.9,
      "connected_rooms": ["kitchen", "living_room"],
      "swing_direction": "left_inward",
      "confidence": 0.80
    }
  ],
  "detected_windows": [
    {
      "position": [120, 100],
      "width_meters": 1.2,
      "wall_side": "west",
      "confidence": 0.85
    }
  ],
  "scale_info": {
    "detected": true,
    "meters_per_pixel": 0.00833
  },
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

**注意**：所有坐标单位为**像素**，`scale_info` 提供了像素到米的换算比例。

中间产物保存到 `data/pipeline/{project_id}/vlm_response.json`。

---

## 阶段 3：数据规范化

**模块**: `src-tauri/src/pipeline/normalizer.rs`
**函数**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> Value`

### 处理步骤

1. **坐标转换** — 像素坐标 × `meters_per_pixel` → 米制坐标
2. **墙壁生成** — 如果 VLM 没有返回墙壁，从房间多边形边缘自动生成
3. **门窗绑定** — 计算门窗位置到最近墙壁的距离，绑定 `wall_ref`
4. **材质生成** — 根据风格（`modern_luxury`/`cream`/`nordic` 等）为每种房间类型生成 PBR 材质
5. **相机预设** — 生成鸟瞰相机 + 每个房间的室内相机
6. **灯光生成** — 每个房间一个灯光（客厅/卧室用面光源，其余用点光源）

### 输出（HomeSceneJSON）

规范化后的场景 JSON，所有坐标为米制。保存到 `data/pipeline/{project_id}/scene_normalized.json`。

---

## 阶段 4：几何修复

**模块**: `src-tauri/src/pipeline/repair.rs`
**函数**: `repair_scene(scene: &mut Value) -> Vec<String>`

在规范化之后、校验之前运行，自动修复 VLM 输出中的几何问题。返回修复操作列表。

### 修复操作

#### 房间多边形修复

| 操作 | 说明 | 阈值 |
|------|------|------|
| 顶点吸附 | 将距离很近的顶点吸附到同一坐标 | 5cm |
| 正交化 | 将接近水平/垂直的边对齐到精确的 H/V 方向 | 10° |
| 闭合修复 | 如果首尾点不重合，追加首点 | 1mm |
| 移除退化房间 | 移除面积过小的房间 | 0.5 m² |
| 重叠检测 | 检测房间多边形重叠并标记 | 50% 顶点内含 |

#### 墙体修复

| 操作 | 说明 | 阈值 |
|------|------|------|
| 端点吸附 | 将距离很近的墙端点吸附到同一坐标 | 5cm |
| 共线合并 | 合并共线且邻近的墙段 | 角度 < 5°，距离 < 10cm |
| room_refs 修复 | 根据墙体与房间多边形边缘的匹配关系，修正 room_refs | 中点距离 < 30cm |

#### 门窗修复

| 操作 | 说明 | 阈值 |
|------|------|------|
| 重新绑定 | 将门窗重新绑定到最近的墙体 | 墙厚 × 2 |

### 输出

修复操作日志，例如：

```
snapped 18 polygon vertex/vertices to nearby points
orthogonalized 3 room polygon(s)
closed 1 unclosed polygon(s)
snapped 6 wall endpoint(s)
merged 2 collinear wall segment(s)
fixed room_refs for 4 wall(s)
rebound 1 opening(s) to closer wall
```

保存到 `data/pipeline/{project_id}/repair_log.json`。

---

## 阶段 5：质量校验

**模块**: `src-tauri/src/pipeline/validate.rs`
**函数**: `validate_scene(scene: &Value, repair_actions: &[String]) -> ValidationReport`

对修复后的场景进行全面校验，生成质量报告。

### 校验规则

#### 房间校验

| 规则 | 严重级别 | 说明 |
|------|----------|------|
| 多边形点数 >= 3 | Error | 退化多边形 |
| 多边形闭合 | Error | 首尾点距离 > 1cm |
| 面积 >= 0.5 m² | Error | 房间太小 |
| 无 NaN/Inf 坐标 | Error | 无效坐标 |
| 长宽比 <= 20:1 | Warning | 极端长宽比 |
| 无自交 | Warning | 多边形可能自交 |
| 卧室面积 >= 3 m² | Warning | 卧室太小 |
| 卫生间面积 <= 30 m² | Warning | 卫生间异常大 |

#### 墙体校验

| 规则 | 严重级别 | 说明 |
|------|----------|------|
| 长度 >= 5cm | Warning | 墙段太短 |
| room_refs 非空 | Warning | 孤立墙体 |

#### 门窗校验

| 规则 | 严重级别 | 说明 |
|------|----------|------|
| wall_ref 存在 | Error | 未绑定墙体 |
| 门宽 0.5–2.0m | Warning | 门宽异常 |
| 窗宽 0.2–4.0m | Warning | 窗宽异常 |

#### 尺度校验

| 规则 | 严重级别 | 说明 |
|------|----------|------|
| 总范围 2–50m | Warning | 比例尺可能错误 |

### 评分计算

```
score = 1.0 - (error_count × 0.15 + warning_count × 0.05)
```

分数限制在 [0, 1] 范围内。

### 子分数

| 子分数 | 计算方式 |
|--------|----------|
| geometry_score | 基于房间/墙体/开口数量的启发式评分 |
| semantic_score | 基于房间命名和类型标注的完整度 |
| scale_score | 基于房间面积是否在合理范围内 |

### 输出（ValidationReport）

```json
{
  "valid": true,
  "score": 0.85,
  "errors": [],
  "warnings": [
    {
      "type": "small_bedroom",
      "message": "Bedroom '次卧' is only 2.8 m²",
      "ids": ["room_3"]
    }
  ],
  "repair_actions": [
    "snapped 18 polygon vertex/vertices to nearby points",
    "closed 1 unclosed polygon(s)"
  ],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "needs_user_review": false
  }
}
```

保存到 `data/pipeline/{project_id}/validation_report.json`。

### parse_quality 注入

校验完成后，`parse_quality` 会被注入到 HomeSceneJSON 中，前端可直接读取：

```json
{
  "rooms": [...],
  "walls": [...],
  "parse_quality": {
    "overall_score": 0.85,
    "geometry_score": 0.90,
    "semantic_score": 0.80,
    "scale_score": 0.85,
    "needs_user_review": false
  }
}
```

---

## 阶段 6：调试叠加层

**模块**: `src-tauri/src/pipeline/overlay.rs`
**函数**: `generate_overlay(processed_path: &str, raw_vlm: &Value, pipeline_dir: &Path) -> Result<(), String>`

将 VLM 解析结果绘制回预处理后的图片上，用于视觉调试。

### 绘制内容

| 元素 | 样式 |
|------|------|
| 房间多边形 | 彩色轮廓线（不同房间类型不同颜色） |
| 房间标签 | 房间名称标注在质心位置 |
| 墙体端点 | 红色小圆点 |
| 门 | 绿色标记 + "D" 标签 |
| 窗 | 蓝色标记 + "W" 标签 |

### 颜色映射

| 房间类型 | 颜色 |
|----------|------|
| living_room | 红色 |
| bedroom | 蓝色 |
| kitchen | 绿色 |
| bathroom | 橙色 |
| dining_room | 紫色 |
| balcony | 黄色 |
| corridor | 灰色 |
| study | 青色 |

### 输出

保存到 `data/pipeline/{project_id}/overlay_debug.png`。

---

## 阶段 7：家具规划

**模块**: `src-tauri/src/pipeline/furniture.rs`
**函数**: `plan_furniture(scene: &Value, data_dir: &Path) -> Result<Value, String>`

使用 LLM 根据房间类型、面积、门窗位置规划家具布局。

### 可用家具类别

sofa, coffee_table, tv_stand, bed_double, bed_single, nightstand, wardrobe, dining_table, dining_chair, desk, bookshelf, bathroom_sink, toilet, shower, kitchen_counter, fridge

### 规则

- 根据房间类型选择合适的家具
- 根据房间面积调整数量（< 8m² 最少，8-15m² 标准，> 15m² 可增加）
- 家具位置必须在房间多边形内
- 不得阻挡门口（门口 0.8m 内不放家具）
- 不得遮挡窗户

---

## 阶段 8：3D 渲染

**模块**: `src/engine/buildScene.ts`
**函数**: `buildScene(scene: HomeSceneJSON) -> BuiltScene`

### 处理步骤

1. **构建地板** (`buildFloors.ts`) — 每个房间的 `polygon` → `BoxGeometry` 薄板（0.04m 厚），材质取 `room.floor_material`
2. **构建墙体** (`buildWalls.ts`) — 每条墙的 `start`/`end` + `height`/`thickness` → `BoxGeometry`，带门/窗洞口切割
3. **构建天花板** (`buildCeilings.ts`) — 每个房间 → 薄板，位于 `ceiling_height` 高度
4. **构建门窗** (`buildOpenings.ts`) — 门框 + 门扇 + 窗框 + 玻璃
5. **构建家具** (`buildObjects.ts` + `furnitureModels.ts`) — 如果 `objects` 为空则根据房间类型自动布局家具；每个家具类别用多个基础几何体组合（box + cylinder + sphere）

### 输出

Three.js 场景，通过 `scene.add(builtScene.group)` 添加到 `<Canvas>` 渲染。

---

## 调试产物

每次解析会在 `data/pipeline/{project_id}/` 生成以下文件：

| 文件 | 说明 |
|------|------|
| `preprocessed.jpg` | 预处理后的图片 |
| `vlm_response.json` | VLM 原始返回的 JSON |
| `scene_normalized.json` | 规范化后的 HomeSceneJSON |
| `repair_log.json` | 几何修复操作日志 |
| `validation_report.json` | 质量校验报告 |
| `overlay_debug.png` | VLM 解析结果叠加图 |
| `meta.json` | 管线元数据（统计信息、校验分数） |

### meta.json 示例

```json
{
  "project_id": "proj_abc123",
  "vlm_stats": {
    "rooms": 4,
    "walls": 7,
    "doors": 2,
    "windows": 2
  },
  "scene_stats": {
    "rooms": 4,
    "walls": 7,
    "objects": 12,
    "materials": 6
  },
  "validation": {
    "score": 0.85,
    "error_count": 0,
    "warning_count": 1,
    "repair_action_count": 3,
    "needs_user_review": false
  }
}
```

---

## 数据流总结

```
┌─────────────────┐
│  原始平面图      │  JPG/PNG, ~2-5MB
│  (像素坐标)      │
└────────┬────────┘
         │ preprocess()
         ▼
┌─────────────────┐
│  预处理图片      │  裁剪+旋转校正+缩放
│  (像素坐标)      │  ~1800x1200
└────────┬────────┘
         │ call_vlm()
         ▼
┌─────────────────┐
│  VLM 原始 JSON   │  房间/墙壁/门窗的像素坐标
│  (像素坐标)      │  + scale_info (meters_per_pixel)
└────────┬────────┘
         │ normalize_scene()
         ▼
┌─────────────────┐
│  HomeSceneJSON   │  米制坐标 + 材质 + 灯光 + 相机
│  (米制坐标)      │
└────────┬────────┘
         │ repair_scene()
         ▼
┌─────────────────┐
│  修复后场景      │  吸附顶点、正交化、闭合、合并墙段
│  (米制坐标)      │  + repair_log.json
└────────┬────────┘
         │ validate_scene()
         ▼
┌─────────────────┐
│  校验报告        │  score, errors, warnings
│                  │  + parse_quality 注入场景
└────────┬────────┘
         │ generate_overlay()
         ▼
┌─────────────────┐
│  调试叠加图      │  overlay_debug.png
│                  │  房间/墙/门窗可视化
└────────┬────────┘
         │ plan_furniture()
         ▼
┌─────────────────┐
│  含家具场景      │  LLM 规划的家具布局
│  (米制坐标)      │
└────────┬────────┘
         │ buildScene()
         ▼
┌─────────────────┐
│  THREE.Group     │  可交互的 3D 模型
│  (3D 渲染)      │  支持漫游/编辑/导出
└─────────────────┘
```

---

## 前端集成

### parse_quality 展示

HomeSceneJSON 中的 `parse_quality` 字段在前端 `SceneInspector` 组件中展示：

- **总分进度条** — 颜色编码：绿色 (>= 80%)、黄色 (>= 50%)、红色 (< 50%)
- **状态图标** — 绿色勾（正常）或黄色警告三角（需要人工检查）
- **子分数** — 几何、语义、尺度三个维度的分数

当 `needs_user_review` 为 `true` 时，提示用户检查解析结果。
