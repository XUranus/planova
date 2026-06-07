---
sidebar_position: 9
title: 家具规划
---

# 家具规划

**模块**: `src-tauri/src/pipeline/furniture.rs`
**函数**: `plan_furniture(scene: &Value, data_dir: &Path) -> Result<Value, String>`

家具规划阶段使用纯文本 LLM 调用，根据房间类型、面积和门窗位置生成具有上下文感知的家具布局。

## 管线位置

```
Normalize → Repair → Validate → [Furniture] → Save → 3D Render
```

在混合管线中，家具规划受质量评分的门控（参见[质量验证](./validation.md)）。

## 工作原理

### 输入准备

1. **筛选房间**：跳过阳台、走廊以及面积在 1-100 m^2 范围之外的房间
2. **查找开口**：对于每个房间，查找其 AABB 内的门窗（包含 0.5m 边距）
3. **构建紧凑输入**：房间 id、类型、名称、面积、多边形以及附近的开口

### LLM 调用

规划器向聊天 LLM（非视觉模型）发送结构化文本提示。其成本约为 VLM 调用的 1/10。

**系统提示词** (`FURNITURE_PLANNER_SYSTEM`)：

```
You are an interior designer. Given room descriptions (type, area, polygon,
door/window positions), plan furniture placement for each room.

AVAILABLE CATEGORIES (use ONLY these exact keys):
sofa, coffee_table, tv_stand, bed_double, bed_single, nightstand, wardrobe,
dining_table, dining_chair, desk, bookshelf, bathroom_sink, toilet, shower,
kitchen_counter, fridge

RULES:
1. Choose furniture categories appropriate for each room type
2. Adjust quantity based on room area:
   - < 8 m^2: minimal furniture only (1-2 items)
   - 8-15 m^2: standard set
   - > 15 m^2: can add extra items
3. Place furniture logically:
   - Sofas face the center of the room or windows
   - Beds: headboard against a wall, nightstands on both sides
   - Wardrobes, bookshelves, kitchen_counter: align flush against walls
   - Never block doorways (leave 0.8m clearance from door position)
   - Never place furniture in front of windows
4. Positions MUST be [x, y] coordinates in meters, within the room polygon
5. Rotation is in radians around Y axis
6. Each dining_chair needs a separate entry
```

**用户消息**（模板中 `{style}` 和 `{rooms_json}` 会被替换）：

```
Style: modern_luxury

Rooms:
[
  {
    "id": "room_1",
    "type": "living_room",
    "name": "客厅",
    "area": 18.13,
    "polygon": [[1.0, 1.666], [4.833, 1.666], [4.833, 4.333], [1.0, 4.333]],
    "openings": [
      {"type": "door", "position": [2.083, 1.666], "width": 0.9},
      {"type": "window", "position": [1.0, 0.833], "width": 1.2}
    ]
  }
]

Output ONLY a JSON object with an "objects" array. Each object must have:
room_id, category, position [x,y], rotation (radians).
No explanation, no markdown fences, just the JSON.
```

### 重试逻辑

- 最多尝试 2 次
- 仅在超时错误时重试
- 重试之间等待 `5 * attempt` 秒

### 响应处理

1. **提取 JSON** 从 LLM 响应中
2. **验证每个对象**：
   - 类别必须在已知的 `CATEGORY_SIZES` 表中
   - 位置必须至少有 2 个坐标
   - 房间 ID 必须匹配现有房间
   - 位置必须在房间的 AABB 内（包含 0.3m 边距）
3. **构建输出对象**并进行适当格式化

## 可用家具类别

每个类别都有定义好的尺寸 `[width, height, depth]`（单位为米）：

| 类别 | 宽度 | 高度 | 深度 | 典型房间 |
|------|------|------|------|----------|
| sofa | 2.2 | 0.85 | 0.9 | living_room |
| coffee_table | 1.2 | 0.45 | 0.6 | living_room |
| tv_stand | 1.8 | 0.5 | 0.4 | living_room |
| bed_double | 2.0 | 0.55 | 1.6 | bedroom |
| bed_single | 2.0 | 0.55 | 1.0 | bedroom |
| nightstand | 0.5 | 0.55 | 0.4 | bedroom |
| wardrobe | 1.8 | 2.2 | 0.6 | bedroom |
| dining_table | 1.6 | 0.75 | 0.9 | dining_room |
| dining_chair | 0.45 | 0.9 | 0.45 | dining_room |
| desk | 1.4 | 0.75 | 0.7 | study |
| bookshelf | 1.0 | 2.0 | 0.35 | study |
| bathroom_sink | 0.6 | 0.85 | 0.5 | bathroom |
| toilet | 0.4 | 0.75 | 0.65 | bathroom |
| shower | 1.0 | 2.1 | 1.0 | bathroom |
| kitchen_counter | 2.4 | 0.9 | 0.6 | kitchen |
| fridge | 0.7 | 1.8 | 0.65 | kitchen |

## 输出格式

场景 JSON 中的每个家具对象：

```json
{
  "id": "furniture_1",
  "type": "furniture",
  "category": "sofa",
  "room_ref": "room_1",
  "position": [2.917, 0, 4.0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "size": [2.2, 0.85, 0.9]
}
```

注意：位置的 Y 分量始终为 0（地面高度）。LLM 接收的是 [x, y]（二维）坐标；管线会添加 Y=0 的地面分量。

### 完整 LLM 响应示例

```json
{
  "objects": [
    {
      "room_id": "room_1",
      "category": "sofa",
      "position": [2.917, 4.0],
      "rotation": 0.0,
      "reasoning": "Place sofa against the south wall, facing north"
    },
    {
      "room_id": "room_1",
      "category": "coffee_table",
      "position": [2.917, 3.2],
      "rotation": 0.0
    },
    {
      "room_id": "room_1",
      "category": "tv_stand",
      "position": [2.917, 1.85],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "bed_double",
      "position": [6.167, 3.0],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "wardrobe",
      "position": [7.2, 2.5],
      "rotation": 1.5708
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [5.5, 3.0],
      "rotation": 0.0
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [6.833, 3.0],
      "rotation": 0.0
    }
  ]
}
```

## 降级行为

如果 LLM 调用失败（超时、API 错误、无效 JSON），规划器会返回未修改的场景，`objects` 为空数组。然后前端的 `buildObjects.ts` 会降级使用硬编码的 `roomFurnitureMap`：

```typescript
const roomFurnitureMap: Record<string, FurnitureItem[]> = {
  living_room: [
    { category: 'sofa', count: 1, placement: 'wall_adjacent' },
    { category: 'coffee_table', count: 1, placement: 'center' },
    { category: 'tv_stand', count: 1, placement: 'wall_adjacent' },
  ],
  bedroom: [
    { category: 'bed', count: 1, placement: 'center' },
    { category: 'wardrobe', count: 1, placement: 'wall_adjacent' },
    { category: 'nightstand', count: 2, placement: 'wall_adjacent' },
  ],
  // ...
}
```

这确保管线始终能产出可渲染的结果。

## 成本

| 步骤 | 类型 | 大约 Token 数 | 相对成本 |
|------|------|---------------|----------|
| VLM 解析 | 图像 + 文本 | ~4000 输入 + ~2000 输出 | 1x |
| 家具 LLM | 仅文本 | ~800 输入 + ~600 输出 | ~0.1x |

家具规划器的成本约为 VLM 解析的 1/10，因为它处理的是结构化文本而非图像。

## 风格感知

家具规划器接收场景的风格（`modern_luxury`、`cream`、`nordic`），并被指示选择与美学风格匹配的家具。LLM 可能会根据风格调整家具的选择和数量，但可用类别保持不变。

## 验证检查

收到 LLM 响应后，规划器进行以下验证：

1. **未知类别**：类别不在 `CATEGORY_SIZES` 中的对象将被跳过
2. **缺少位置**：位置坐标少于 2 个的对象将被跳过
3. **未知房间**：引用不存在的房间 ID 的对象将被跳过
4. **越界**：位置超出房间 AABB（包含 0.3m 边距）的对象将被跳过

规划器会记录通过验证的对象数量与 LLM 提议的对象数量：

```
Furniture planner: 12/15 objects validated
```
