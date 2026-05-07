# Changelog

## [Unreleased] - 2026-05-07

### Pipeline V2: Title Block & Legend Region Filtering

图例和标题栏线条被误识别为墙体的问题修复。

**问题:** 墙体掩膜提取未做空间区域过滤，导致标题栏边框线、图例表格分割线等非墙体元素被检测为墙体。标题栏水平线跨度接近全图宽度（~975px），在逐行密度分析中产生 72% 的峰值密度，完全淹没真实墙体信号（~5%），使得基于峰值的区域检测失效。

**改进结果 (plane-design-3.png):**

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 标题区墙体像素 (y<150) | 2502 | 0 | 完全移除 |
| 图例区墙体像素 (y>900) | 7998 | 0 | 完全移除 |
| 对齐 IoU | 0.343 | 0.391 | +14% |
| 对齐 Precision | 0.439 | 0.522 | +19% |
| 对齐总分 | 0.507 | 0.540 | +7% |

#### Changed

- **`src-tauri/src/pipeline/wall_mask.rs`** — 新增滑动窗口区域检测替代峰值阈值法：计算前缀和，在行密度曲线上找到累积密度最高的窗口（窗口高度=图像高度30%），然后向两侧扩展到密度≥均值5%的边界；新增 `filter_by_thickness` 函数，按连通分量包围盒最小维度过滤薄线条（<5px）；移除 `component_touches_border` 过滤器（过于激进，会移除外墙）

### Pipeline V2: Hybrid CV+VLM Wall Detection Optimization

优化混合 CV+VLM 流水线的墙体检测质量和端到端生成效果。

**问题:** 初版混合流水线使用 Canny 边缘检测提取墙体掩膜，会捕获所有边缘（彩色房间边界、尺寸标注线、文字、边框），导致 Hough 变换检测到大量跨越整张图片的伪线段，对齐分数仅 0.19。

**改进结果 (端到端测试, plane-design-3.png):**

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 墙体掩膜像素 | 138K (9.7%) | 22K (1.6%) | 84% 减少 |
| CV 线段数 | 34 (全图跨越) | 15-60 (有界) | 有界化 |
| 房间面数 | 1 (整体包围盒) | 3 (每房间) | 3x |
| 几何分数 | 1.00 | 1.00 | - |
| 语义分数 | 0.50 | 0.83 | +66% |
| 尺度分数 | 0.00 | 1.00 | - |
| 对齐 IoU | 0.118 | 0.343 | +191% |
| 对齐召回率 | 0.199 | 0.613 | +208% |
| 对齐总分 | 0.190 | 0.507 | +167% |

#### Changed

- **`src-tauri/src/pipeline/wall_mask.rs`** — 用强度阈值化 (<70) 替换 Canny 边缘检测，新增连通分量标记和面积过滤，移除小于图像面积 0.03% 的噪点分量和接触边框的分量
- **`src-tauri/src/pipeline/wall_graph.rs`** — 重写线段提取：沿 Hough 线在掩膜中扫描实际墙体范围，不再裁剪到图像边界；降低 Hough 投票阈值 (min_dim/20, min=10) 捕获短线段；扩大角度容差 (水平 82-98°, 垂直 0-8°/172-180°)；添加图像边界外线段过滤
- **`src-tauri/src/pipeline/plan_graph.rs`** — 新增 `generate_faces_from_centroids`：当 VLM 仅返回房间质心而无多边形时，基于墙体包围盒按质心中点细分生成每房间矩形面；提取 `wall_bbox` 辅助函数
- **`src-tauri/src/pipeline/alignment.rs`** — 渲染结构掩膜的墙体线段厚度从 2px 增加到 7px，匹配实际墙体宽度，改善 IoU 计算准确性
- **`src-tauri/src/pipeline/convert.rs`** — 房间引用邻近阈值从 0.3m 放宽到 0.8m

#### Fixed

- **`src-tauri/src/pipeline/wall_graph.rs`** — 修复 Hough 极坐标转换中 angle=180° 时 cos=-1 导致墙体 X 坐标为负值的 bug
- **`src-tauri/src/pipeline/plan_graph.rs`** — 修复 `labels` 变量缺少 `mut` 声明导致编译失败
- **`src/stores/sceneStore.ts`** — 修复 Retry Parse 按钮无视觉反馈：新增 `isRetrying` 状态，重试期间不再立即清除 ReviewGate 数据
- **`src/components/viewer/ReviewGate.tsx`** — 重试期间显示全屏加载遮罩（旋转图标 + 提示文字）
- **`src/i18n/locales/en-US.json`** / **`zh-CN.json`** — 新增 `review.retrying` 国际化文案

#### Added

- **`src-tauri/src/pipeline/test_e2e.rs`** — 新增端到端集成测试，覆盖墙体掩膜提取、墙体图构建、PlanGraph 构建、场景转换、对齐计算和验证的完整流水线

---

## [Previous] - 2026-05-06

### Pipeline V2: Hybrid CV+VLM Architecture (Initial Implementation)

初始实现混合 CV+VLM 流水线架构。

#### Added

- **`src-tauri/src/pipeline/wall_mask.rs`** — Canny 边缘检测 + 形态学操作提取二值墙体掩膜
- **`src-tauri/src/pipeline/wall_graph.rs`** — Hough 线段检测、共线合并、端点吸附
- **`src-tauri/src/pipeline/plan_graph.rs`** — PlanGraphJSON 中间层：合并 CV 墙体图与 VLM 语义数据
- **`src-tauri/src/pipeline/alignment.rs`** — 墙体掩膜 vs 渲染结构的 IoU/Precision/Recall 对齐评分
- **`src-tauri/src/pipeline/overlay_alignment.rs`** — 对齐叠加可视化 + 诊断报告
- **`src-tauri/src/pipeline/convert.rs`** — PlanGraphJSON (像素) → HomeSceneJSON (米) 转换
- **`src-tauri/src/pipeline/mod.rs`** — 混合流水线编排、质量门控 (furniture gating)、制品保存
- **`src-tauri/src/pipeline/validate.rs`** — 新增 `image_alignment_score` 到 `ParseQuality`，新增 `ImageAlignmentReport`
- **`src-tauri/src/ai/prompts.rs`** — 混合模式 VLM 提示词（仅语义分析，不含几何）
- **`src-tauri/src/ai/client.rs`** — 新增 `call_vlm_hybrid`，提取共享 `call_vlm_with_prompts`
- **`src-tauri/src/settings.rs`** — 新增 `pipeline_mode` 设置 (`hybrid_cv_vlm` / `legacy`)
- **`src/pages/SettingsPage.tsx`** — 流水线模式下拉选择 UI
- **`src/components/viewer/ReviewGate.tsx`** — 解析质量审查门控组件（质量分数、对齐叠加图、诊断摘要）
- **`src/pages/ProjectDetail.tsx`** — 需要审查时显示 ReviewGate 替代 3D 视图
- **`src/stores/sceneStore.ts`** — 新增 `pendingReviewSceneId`、`reviewSceneData`、`acceptReview`、`retryParse`
- **`src/api/tasks.ts`** — 新增 `PipelineArtifacts` 接口和 `getPipelineArtifacts`
- **`src/types/scene.ts`** — 新增 `image_alignment_score`、`ImageAlignmentReport`、`DiagnosisReport`
- **`src/i18n/locales/en-US.json`** / **`zh-CN.json`** — 审查门控和流水线模式国际化文案
