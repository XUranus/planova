---
sidebar_position: 3
title: VLM 多模态解析
---

# VLM 多模态解析

**模块**：`src-tauri/src/ai/client.rs`、`src-tauri/src/ai/prompts.rs`
**函数**：`call_vlm()`、`call_vlm_hybrid()`、`call_vlm_with_prompts()`

VLM（视觉语言模型）阶段将预处理后的平面图图像发送给多模态 LLM，并以 JSON 格式提取结构化的几何和语义数据。

## 两种提示词模式

流水线根据模式使用不同的提示词：

| 模式 | 函数 | 提示词 | VLM 提取内容 |
|------|------|--------|-------------|
| Legacy | `call_vlm()` | `FLOORPLAN_PARSE_SYSTEM` | 完整几何（房间多边形、墙体）+ 语义 |
| Hybrid | `call_vlm_hybrid()` | `FLOORPLAN_PARSE_HYBRID_SYSTEM` | 仅语义（房间标签/质心、门窗、比例） |

在 Hybrid 模式下，墙体几何来自 CV，因此 VLM 仅提供房间识别、开口检测和比例信息。

## 请求构造

1. **Base64 编码** 预处理后的图像
2. **构建 OpenAI 兼容的** Vision API 请求，包含：
   - 系统消息：建筑分析指令
   - 用户消息：图像（作为 `image_url`，设置 `detail: "high"`）+ 文本提示
3. **调用 API**，参数为 `max_tokens: 16384`、`temperature: 0.1`
4. **从响应中提取 JSON**，处理以下情况：
   - 直接 JSON 解析
   - Markdown 代码围栏（` ```json ... ``` `）
   - `{"detected_rooms"` 前缀搜索
   - 第一个 `{` 到最后一个 `}` 的回退方案
   - 推理模型的 `reasoning_content` 字段

```rust
let request_body = serde_json::json!({
    "model": config.model,
    "messages": messages,
    "max_tokens": 16384,
    "temperature": 0.1,
});
```

## 重试逻辑

- VLM 调用最多重试 3 次（Legacy），家具规划最多重试 2 次
- 仅在超时错误（`timed out`、`timeout`）时重试
- 重试间隔为 `5 * attempt` 秒
- 非超时错误立即失败

## 系统提示词：Legacy 模式

Legacy 系统提示词指示 VLM 提取完整的平面图数据。关键指令：

### 几何规则
- 多边形坐标必须使用 **图像像素**（非米）
- 必须沿着实际墙体线条追踪房间边界 -- 不要生成通用矩形
- 每个房间多边形必须闭合（最后一个坐标等于第一个）
- 墙体线条必须水平或垂直 -- 不允许对角线
- 相邻房间共享的墙边必须具有完全相同的坐标
- 房间多边形不得重叠

### 语义规则
- 中文标签映射：`客厅` = `living_room`，`卧室/主卧/次卧` = `bedroom`，`厨房` = `kitchen`，`卫生间` = `bathroom`，等等
- 查找尺寸标记（如 1800、3600 等毫米单位的数字）以确定比例
- 读取每一个可见的尺寸标注并在 `dimension_annotations` 中报告
- 门是弧线+直线符号；窗是墙体中的平行线

### 墙体-房间关系
- 每面墙必须有 `room_refs` 数组，列出其毗邻的房间
- 内墙连接恰好 2 个房间
- 外墙连接恰好 1 个房间

### 置信度校准
- `>= 0.8`：墙体线条和房间边界清晰可见
- `0.5-0.8`：边界部分可见或模糊
- `< 0.5`：猜测 -- 当墙体线条模糊或不清晰时使用

## 系统提示词：Hybrid 模式

Hybrid 提示词告知 VLM，CV 已经提取了墙体几何，因此应重点关注：

1. **房间识别** -- room_type、名称（中文标签）、质心像素坐标、置信度
2. **门窗检测** -- 位置、宽度（米）、连接的房间、开启方向
3. **窗户检测** -- 位置、宽度（米）
4. **比例检测** -- 仅在至少可见两个带尺寸线的尺寸数字时才设置 `detected=true`
5. **尺寸标注** -- 如果可见则必填；读取所有带尺寸箭头的数字

Hybrid 提示词明确说明："不要输出墙段或多边形 -- CV 系统负责几何。"

## 输出 JSON 格式

### Legacy 模式输出

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
    {
      "start": [120, 0],
      "end": [900, 0],
      "room_refs": ["room_1"],
      "confidence": 0.95
    }
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
  "dimension_annotations": [
    {
      "text": "3600",
      "position": [400, 550],
      "direction": "horizontal"
    }
  ],
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

### Hybrid 模式输出

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "name": "客厅",
      "centroid": [350, 360],
      "confidence": 0.90
    }
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
  "dimension_annotations": [
    {
      "text": "3600",
      "position": [400, 550],
      "direction": "horizontal"
    }
  ],
  "overall_dimensions": {
    "width_pixels": 780,
    "height_pixels": 520,
    "width_meters": 6.5,
    "height_meters": 4.3
  },
  "warnings": []
}
```

注意关键区别：Hybrid 模式输出 `centroid` 而非 `polygon` 表示房间，并且完全省略 `detected_walls`。

## 坐标系

VLM 输出中的所有坐标均为 **图像像素**。`scale_info` 字段提供 `meters_per_pixel` 转换比率，供下游阶段转换为米。

| 字段 | 单位 | 说明 |
|------|------|------|
| 房间多边形顶点 | 像素 | 绝对图像坐标 |
| 房间质心 | 像素 | 仅 Hybrid 模式 |
| 墙体起止点 | 像素 | 仅 Legacy 模式 |
| 门窗位置 | 像素 | |
| `meters_per_pixel` | 米/像素 | 转换比率 |
| `width_meters`（门窗） | 米 | 已为实际物理单位 |
| `dimension_annotations.text` | 毫米 | 平面上印刷的数值 |

## 支持的 VLM 提供商

流水线使用 OpenAI 兼容的 API 格式，因此任何实现了带图像支持的 `/chat/completions` 端点的提供商均可使用：

- OpenAI（GPT-4o、GPT-4 Vision）
- 兼容的本地模型（通过 vLLM、Ollama 等）
- 其他 OpenAI 兼容 API

VLM 配置存储在 `LlmConfig` 中，包含字段：`base_url`、`api_key`、`model`。

## 成本对比

| 步骤 | 类型 | 大约 Token 数 | 相对成本 |
|------|------|-------------|---------|
| VLM Parse（Legacy） | 图像 + 文本 | ~4000 输入 + ~2000 输出 | 1x（基准） |
| VLM Semantic（Hybrid） | 图像 + 文本 | ~3000 输入 + ~1500 输出 | ~0.7x |
| Furniture LLM | 纯文本 | ~800 输入 + ~600 输出 | ~0.1x |

Hybrid 模式的 VLM 调用成本略低，因为提示词要求的输出更少（不包含墙体几何）。
