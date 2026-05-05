# LLM 家具自动布局规划

## 概述

目前 Planova 的家具布局使用硬编码的 `roomFurnitureMap`（位于 `src/data/furnitureLayout.ts`）——每个客厅都得到相同的沙发 + 茶几 + 电视柜，不考虑房间大小、形状或风格。本方案提出基于 LLM 的规划步骤，生成上下文感知的家具布局。

## 当前方案

```
normalize_scene() → [硬编码 roomFurnitureMap] → buildObjects()
```

`roomFurnitureMap` 为每种房间类型分配固定的家具列表：

```typescript
// src/data/furnitureLayout.ts
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

`buildObjects.ts` 中的放置逻辑：
1. 在房间 AABB 内随机选一个位置
2. 检查与已放置家具的碰撞
3. 检查门口排除区域
4. 如果无碰撞则放置；否则最多重试 20 次

## 当前方案的问题

| # | 问题 | 示例 |
|---|------|------|
| 1 | **忽略房间大小** | 5 m² 的卧室和 20 m² 的卧室得到相同的家具 |
| 2 | **忽略房间形状** | L 形房间的中心放置家具会与墙壁重叠 |
| 3 | **忽略风格** | `modern_luxury` 和 `nordic` 风格的房间得到相同的家具 |
| 4 | **不考虑门口** | 家具可能阻挡门的开启路径，即使有排除区域 |
| 5 | **不利用墙面** | 衣柜、书架应靠墙放置，当前方案是随机放置 |
| 6 | **静态类别** | 无法适应不常见的房间类型（书房、储藏间、阳台） |

## 方案：新增步骤 3.5 — LLM 家具规划

在数据规范化和 3D 渲染之间插入新的管线阶段：

```
normalize_scene() → [LLM 家具规划] → buildObjects()
```

LLM 接收结构化的房间数据（不含图片），返回家具放置方案。这是一个**纯文本** API 调用——比 VLM 图片解析步骤便宜得多。

### 管线集成

```
原始图片 → [预处理] → [VLM 解析] → [数据规范化] → [LLM 规划] → [3D 渲染]
                                                    ↑ 新增步骤
```

**模块**: `backend/app/pipeline/furniture_planner.py`
**函数**: `plan_furniture(scene: HomeSceneJSON, style: str) -> HomeSceneJSON`

该函数用 LLM 规划的家具填充 HomeSceneJSON 的 `objects` 数组。

### 输入（给 LLM）

```json
{
  "style": "modern_luxury",
  "rooms": [
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
    },
    {
      "id": "room_2",
      "type": "bedroom",
      "name": "主卧",
      "area": 12.50,
      "polygon": [[4.833, 1.666], [7.5, 1.666], [7.5, 4.333], [4.833, 4.333]],
      "openings": [
        {"type": "door", "position": [5.833, 1.666], "width": 0.9},
        {"type": "window", "position": [4.167, 4.333], "width": 1.8}
      ]
    }
  ]
}
```

### 输出（来自 LLM）

```json
{
  "objects": [
    {
      "room_id": "room_1",
      "category": "sofa",
      "position": [2.917, 4.0],
      "rotation": 0.0,
      "reasoning": "沙发靠南墙放置，面朝北朝向电视区"
    },
    {
      "room_id": "room_1",
      "category": "coffee_table",
      "position": [2.917, 3.2],
      "rotation": 0.0,
      "reasoning": "沙发前方居中，留出通往门口的通道"
    },
    {
      "room_id": "room_1",
      "category": "tv_stand",
      "position": [2.917, 1.85],
      "rotation": 0.0,
      "reasoning": "靠内墙放置，面向沙发"
    },
    {
      "room_id": "room_2",
      "category": "bed",
      "position": [6.167, 3.0],
      "rotation": 0.0,
      "reasoning": "床靠南墙居中，床头朝北"
    },
    {
      "room_id": "room_2",
      "category": "wardrobe",
      "position": [7.2, 2.5],
      "rotation": 1.5708,
      "reasoning": "衣柜靠东墙放置，柜门朝向房间内部"
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [5.5, 3.0],
      "rotation": 0.0,
      "reasoning": "床的左侧"
    },
    {
      "room_id": "room_2",
      "category": "nightstand",
      "position": [6.833, 3.0],
      "rotation": 0.0,
      "reasoning": "床的右侧"
    }
  ]
}
```

### LLM Prompt 设计

```
你是一名室内设计师。根据房间描述（类型、面积、多边形、门窗位置），规划家具布局。

规则：
1. 根据房间类型选择合适的家具类别
2. 根据房间面积调整数量：
   - < 8 m²：仅放置最基本的家具
   - 8-15 m²：标准配置
   - > 15 m²：增加额外物品（边桌、绿植、置物架）
3. 合理放置家具：
   - 沙发面向电视柜或窗户
   - 床头靠墙，两侧放床头柜
   - 衣柜靠墙放置
   - 不要阻挡门口（留 0.8m 通行空间）
   - 不要在窗户前方放置家具
4. 位置坐标必须在房间多边形内
5. 所有坐标单位为米，与输入的多边形坐标系一致
6. 风格：{style} — 选择符合该风格的家具

仅返回包含 "objects" 数组的合法 JSON。
```

### 实现计划

| 步骤 | 操作 | 文件 |
|------|------|------|
| 1 | 创建家具规划模块 | `backend/app/pipeline/furniture_planner.py` |
| 2 | 在 normalize 之后、保存之前调用规划器 | `backend/app/pipeline/floorplan_parser.py` |
| 3 | buildObjects 已支持 `objects` 数组 | `src/engine/buildObjects.ts`（无需修改） |
| 4 | 降级方案：LLM 失败时使用硬编码布局 | `furniture_planner.py` |

### 降级策略

如果 LLM 调用失败（超时、API 错误、JSON 无效），规划器返回 `objects: []` 的场景，`buildObjects.ts` 退回到现有的硬编码 `roomFurnitureMap` 逻辑。确保管线始终能产出结果。

## 成本分析

| 步骤 | 类型 | Token（约） | 相对成本 |
|------|------|------------|---------|
| VLM 解析 | 图片 + 文本 | ~4000 输入 + ~2000 输出 | 1x（基准） |
| LLM 规划 | 纯文本 | ~800 输入 + ~600 输出 | ~0.1x |

家具规划比 VLM 解析便宜约 10 倍，因为它处理的是结构化文本而非图片。

## 未来增强

- **多房间协调**：确保相邻房间的家具不冲突（如共享墙面的使用）
- **用户约束**：允许用户在 LLM 规划前固定某些家具位置
- **迭代优化**：LLM 审查自身的放置结果，检测碰撞并调整
- **风格专属目录**：不同风格使用不同的家具类别（如 `nordic` 在客厅放书架，`modern_luxury` 放吧台车）
