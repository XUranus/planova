# 平面图 AI 解析管线

## 概述

Planova 将一张户型平面图（JPG/PNG）自动转化为可漫游的 3D 室内模型。整个管线分为 4 个阶段：

```
原始图片 → [预处理] → [VLM 解析] → [数据规范化] → [3D 渲染]
```

每个阶段的中间产物保存在 `data/pipeline/{project_id}/` 目录下，便于调试。

---

## 阶段 1：图像预处理

**模块**: `backend/app/pipeline/preprocess.py`
**函数**: `preprocess_floor_plan(input_path: str) -> str`

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

**模块**: `backend/app/ai/openai_client.py`
**函数**: `parse_floor_plan_with_vlm(image_path: str) -> dict`

### 处理步骤

1. 将预处理后的图片 Base64 编码
2. 构造 OpenAI 兼容的 Vision API 请求（system prompt + 图片）
3. 调用多模态 LLM（支持配置：`mimo-v2.5`、`mimo-v2-pro` 等）
4. 从模型回复中提取 JSON（支持 markdown 代码块、推理模型的 reasoning_content 等格式）

### System Prompt 关键指令

```
- 坐标必须是图片像素值（不是米）
- 沿实际墙体线条描摹房间轮廓（不要生成通用矩形）
- 中文标签映射：客厅=living_room, 卧室=bedroom, 厨房=kitchen, 卫生间=bathroom...
- 查找尺寸标注（如 1800、3600）确定比例尺
- 门 = 弧线+直线符号；窗 = 墙体中的平行线
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
      "polygon": [[120, 200], [580, 200], [580, 520], [120, 520]],
      "confidence": 0.92
    },
    {
      "type": "bedroom",
      "name": "主卧",
      "polygon": [[580, 200], [900, 200], [900, 520], [580, 520]],
      "confidence": 0.88
    },
    {
      "type": "kitchen",
      "name": "厨房",
      "polygon": [[120, 0], [350, 0], [350, 200], [120, 200]],
      "confidence": 0.85
    },
    {
      "type": "bathroom",
      "name": "卫生间",
      "polygon": [[350, 0], [580, 0], [580, 200], [350, 200]],
      "confidence": 0.90
    }
  ],
  "detected_walls": [
    {"start": [120, 0], "end": [900, 0], "confidence": 0.95},
    {"start": [900, 0], "end": [900, 520], "confidence": 0.95},
    {"start": [120, 520], "end": [900, 520], "confidence": 0.95},
    {"start": [120, 0], "end": [120, 520], "confidence": 0.95},
    {"start": [120, 200], "end": [900, 200], "confidence": 0.90},
    {"start": [580, 200], "end": [580, 520], "confidence": 0.88},
    {"start": [350, 0], "end": [350, 200], "confidence": 0.85}
  ],
  "detected_doors": [
    {
      "position": [250, 200],
      "width_meters": 0.9,
      "connected_rooms": ["kitchen", "living_room"],
      "swing_direction": "left_inward",
      "confidence": 0.80
    },
    {
      "position": [700, 200],
      "width_meters": 0.9,
      "connected_rooms": ["bedroom", "living_room"],
      "swing_direction": "right_inward",
      "confidence": 0.75
    }
  ],
  "detected_windows": [
    {
      "position": [120, 100],
      "width_meters": 1.2,
      "wall_side": "west",
      "confidence": 0.85
    },
    {
      "position": [500, 520],
      "width_meters": 1.8,
      "wall_side": "south",
      "confidence": 0.82
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

**注意**：所有坐标单位为**像素**，`scale_info` 提供了像素到米的换算比例。上面示例中 `meters_per_pixel = 0.00833`（即约 120 像素 = 1 米）。

中间产物保存到 `data/pipeline/{project_id}/vlm_response.json`。

---

## 阶段 3：数据规范化

**模块**: `backend/app/pipeline/normalizer.py`
**函数**: `normalize_scene(raw, style, ceiling_height, wall_thickness, project_name, project_id) -> dict`

### 处理步骤

1. **坐标转换** — 像素坐标 × `meters_per_pixel` → 米制坐标
2. **墙壁生成** — 如果 VLM 没有返回墙壁，从房间多边形边缘自动生成
3. **门窗绑定** — 计算门窗位置到最近墙壁的距离，绑定 `wall_ref`
4. **材质生成** — 根据风格（`modern_luxury`/`cream`/`nordic` 等）为每种房间类型生成 PBR 材质
5. **相机预设** — 生成鸟瞰相机 + 每个房间的室内相机
6. **灯光生成** — 每个房间一个灯光（客厅/卧室用面光源，其余用点光源）

### 输入

VLM 原始 JSON + 项目参数：

```python
raw = {上述 VLM 输出}
style = "modern_luxury"
ceiling_height = 2.8
wall_thickness = 0.2
project_name = "我的家"
project_id = "proj_abc123"
```

### 输出（HomeSceneJSON）

```json
{
  "schema_version": "0.1.0",
  "project": {
    "id": "proj_abc123",
    "name": "我的家",
    "unit": "meter"
  },
  "global": {
    "style": "modern_luxury",
    "ceiling_height": 2.8,
    "wall_thickness": 0.2
  },
  "rooms": [
    {
      "id": "room_1",
      "type": "living_room",
      "name": "客厅",
      "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
      "area": 18.13,
      "floor_material": "mat_modern_luxury_floor_living_room",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_2",
      "type": "bedroom",
      "name": "主卧",
      "polygon": [[4.833, 1.666], [7.5, 1.666], [7.5, 4.333], [4.833, 4.333]],
      "area": 12.50,
      "floor_material": "mat_modern_luxury_floor_bedroom",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_3",
      "type": "kitchen",
      "name": "厨房",
      "polygon": [[1.0, 0], [2.917, 0], [2.917, 1.666], [1.0, 1.666]],
      "area": 5.14,
      "floor_material": "mat_modern_luxury_floor_kitchen",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    },
    {
      "id": "room_4",
      "type": "bathroom",
      "name": "卫生间",
      "polygon": [[2.917, 0], [4.833, 0], [4.833, 1.666], [2.917, 1.666]],
      "area": 5.14,
      "floor_material": "mat_modern_luxury_floor_bathroom",
      "wall_material": "mat_modern_luxury_wall",
      "ceiling_material": "mat_modern_luxury_ceiling"
    }
  ],
  "walls": [
    {"id": "wall_1", "start": [1.0, 0], "end": [7.5, 0], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_2", "start": [7.5, 0], "end": [7.5, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_3", "start": [1.0, 4.333], "end": [7.5, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_4", "start": [1.0, 0], "end": [1.0, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_5", "start": [1.0, 1.666], "end": [7.5, 1.666], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_6", "start": [4.833, 1.666], "end": [4.833, 4.333], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]},
    {"id": "wall_7", "start": [2.917, 0], "end": [2.917, 1.666], "height": 2.8, "thickness": 0.2, "room_refs": ["room_1"]}
  ],
  "openings": [
    {
      "id": "door_1",
      "type": "door",
      "wall_ref": "wall_5",
      "position": [2.083, 1.666],
      "width": 0.9,
      "height": 2.1,
      "sill_height": 0,
      "swing": "left_inward"
    },
    {
      "id": "door_2",
      "type": "door",
      "wall_ref": "wall_5",
      "position": [5.833, 1.666],
      "width": 0.9,
      "height": 2.1,
      "sill_height": 0,
      "swing": "right_inward"
    },
    {
      "id": "window_1",
      "type": "window",
      "wall_ref": "wall_4",
      "position": [1.0, 0.833],
      "width": 1.2,
      "height": 1.2,
      "sill_height": 0.9
    },
    {
      "id": "window_2",
      "type": "window",
      "wall_ref": "wall_3",
      "position": [4.167, 4.333],
      "width": 1.8,
      "height": 1.4,
      "sill_height": 0.9
    }
  ],
  "objects": [],
  "materials": [
    {
      "id": "mat_modern_luxury_wall",
      "type": "pbr",
      "name": "modern_luxury Wall",
      "base_color": "#C8C0B8",
      "roughness": 0.85,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_ceiling",
      "type": "pbr",
      "name": "modern_luxury Ceiling",
      "base_color": "#F0EDE8",
      "roughness": 0.9,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_floor_living_room",
      "type": "pbr",
      "name": "modern_luxury Floor living_room",
      "base_color": "#6B4F3A",
      "roughness": 0.6,
      "metalness": 0.0
    },
    {
      "id": "mat_modern_luxury_floor_bedroom",
      "type": "pbr",
      "name": "modern_luxury Floor bedroom",
      "base_color": "#7A6050",
      "roughness": 0.65,
      "metalness": 0.0
    }
  ],
  "lights": [
    {
      "id": "light_room_1",
      "type": "area",
      "name": "客厅 Light",
      "position": [2.917, 2.65, 3.0],
      "rotation": [0, 0, 0],
      "intensity": 500,
      "color": "#fff4e6",
      "size": [1.5, 1.5]
    },
    {
      "id": "light_room_3",
      "type": "point",
      "name": "厨房 Light",
      "position": [1.958, 2.65, 0.833],
      "rotation": [0, 0, 0],
      "intensity": 350,
      "color": "#ffffff"
    }
  ],
  "cameras": [
    {
      "id": "cam_overview",
      "name": "Overview",
      "type": "perspective",
      "position": [4.25, 5.6, 8.583],
      "target": [4.25, 0, 2.167],
      "fov": 50
    },
    {
      "id": "cam_room_1",
      "name": "客厅",
      "type": "perspective",
      "position": [1.417, 1.6, 1.5],
      "target": [2.917, 1.2, 3.0],
      "fov": 65
    }
  ]
}
```

**关键变化**：
- 所有坐标从**像素**转换为**米**（`像素 × meters_per_pixel`）
- 房间自动分配了材质引用（`floor_material`、`wall_material`、`ceiling_material`）
- 新增了灯光、相机预设
- 门窗绑定了最近的墙体

中间产物保存到 `data/pipeline/{project_id}/scene_normalized.json`。

---

## 阶段 4：3D 渲染

**模块**: `src/engine/buildScene.ts`
**函数**: `buildScene(scene: HomeSceneJSON) -> BuiltScene`

### 处理步骤

1. **构建地板** (`buildFloors.ts`) — 每个房间的 `polygon` → `BoxGeometry` 薄板（0.04m 厚），材质取 `room.floor_material`
2. **构建墙体** (`buildWalls.ts`) — 每条墙的 `start`/`end` + `height`/`thickness` → `BoxGeometry`，带门/窗洞口切割
3. **构建天花板** (`buildCeilings.ts`) — 每个房间 → 薄板，位于 `ceiling_height` 高度
4. **构建门窗** (`buildOpenings.ts`) — 门框 + 门扇 + 窗框 + 玻璃
5. **构建家具** (`buildObjects.ts` + `furnitureModels.ts`) — 如果 `objects` 为空则根据房间类型自动布局家具；每个家具类别用多个基础几何体组合（box + cylinder + sphere）

### 输入

HomeSceneJSON（阶段 3 的输出）。

### 输出

Three.js 场景：

```
THREE.Group "home_scene_proj_abc123"
├── THREE.Group "structure"
│   ├── THREE.Mesh "floor_room_1"     (BoxGeometry, 4.83×0.04×3.67m, 木纹材质)
│   ├── THREE.Mesh "floor_room_2"     (BoxGeometry, 2.67×0.04×2.67m, 卧室地板)
│   ├── THREE.Mesh "wall_1"           (BoxGeometry, 6.5×2.8×0.2m, 墙面材质)
│   ├── THREE.Mesh "wall_2"           (BoxGeometry, ...)
│   └── ...
├── THREE.Group "door_1"              (门框 + 门扇)
├── THREE.Group "window_1"            (窗框 + 玻璃)
├── THREE.Group "obj_sofa"            (4 个 Box + 4 个 Cylinder, 沙发)
├── THREE.Group "obj_bed"             (床垫 + 床头板 + 2 个枕头)
├── THREE.Mesh "ceiling_room_1"       (BoxGeometry, 天花板)
└── ...
```

最终在 `SceneViewer.tsx` 中通过 `scene.add(builtScene.group)` 将整个组添加到 Three.js 场景，渲染到 `<Canvas>` 中。

---

## 调试产物

每次解析会在 `data/pipeline/{project_id}/` 生成以下文件：

| 文件 | 说明 |
|------|------|
| `preprocessed.jpg` | 预处理后的图片 |
| `vlm_response.json` | VLM 原始返回的 JSON |
| `scene_normalized.json` | 规范化后的 HomeSceneJSON |
| `meta.json` | 管线元数据（统计信息、各阶段耗时） |

---

## 数据流总结

```
┌─────────────────┐
│  原始平面图      │  JPG/PNG, ~2-5MB
│  (像素坐标)      │
└────────┬────────┘
         │ preprocess_floor_plan()
         ▼
┌─────────────────┐
│  预处理图片      │  裁剪+旋转校正+缩放
│  (像素坐标)      │  ~1800x1200
└────────┬────────┘
         │ parse_floor_plan_with_vlm()
         ▼
┌─────────────────┐
│  VLM 原始 JSON   │  房间/墙壁/门窗的像素坐标
│  (像素坐标)      │  + scale_info (meters_per_pixel)
└────────┬────────┘
         │ normalize_scene()
         ▼
┌─────────────────┐
│  HomeSceneJSON   │  米制坐标 + 材质 + 灯光 + 相机
│  (米制坐标)      │  标准化的场景描述
└────────┬────────┘
         │ buildScene()
         ▼
┌─────────────────┐
│  THREE.Group     │  可交互的 3D 模型
│  (3D 渲染)      │  支持漫游/编辑/导出
└─────────────────┘
```
