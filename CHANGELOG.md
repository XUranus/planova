# Changelog

## [Unreleased] - 2026-05-08

### Pipeline V3: Wall Cleanup, Door/Window Binding & Dimension Annotation Cross-Validation

墙体平行边合并、门窗墙体吸附、尺度交叉验证、墙体网格房间分割。

**问题:** VLM 仍返回 mpp=0.02（因为 50m 上限过于宽松），窗户位于 y=0（墙体外侧），门连接不存在的"走廊"房间，37 条墙段中大量重复（厚墙两侧边缘被分别检测）。

**改进:**

| 问题 | 修复 |
|---|---|
| 尺度 50m 阈值太松 | 改为 20m，VLM 幻觉 mpp=0.02 (→27.4m) 被降级为 0.2 置信度 |
| VLM 不报告尺寸标注 | 增加 `dimension_annotations` 结构化字段，强制要求读取所有可见标注数字 |
| CV 回退常数 20→8 | 假设典型住宅最长 6-12m，置信度 0.35→0.45 |
| 37 条重复墙段 | 新增 `merge_parallel_segments`，按位置聚类合并平行线段为中线 |
| 窗户在墙外 | 新增 `snap_openings_to_walls`，将门窗吸附到最近墙体 |
| 门连不存在房间 | 验证 `connected_rooms`，移除无效房间引用 |
| 房间多边形不准 | 新增 `generate_faces_from_walls`，用实际墙体位置做网格分割 |

#### Changed

- **`src-tauri/src/pipeline/plan_graph.rs`** — `extract_scale_candidates`: 合理性上限 50m→20m，新增 `dimension_annotations` 交叉验证（中位数 mpp，置信度 0.9）；CV 回退常数 20→8，置信度 0.35→0.45；新增 `snap_openings_to_walls`（点到线段距离，60px 吸附半径）；新增 `generate_faces_from_walls`（墙体坐标网格 → 最近质心分配 → 合并同房间格子）
- **`src-tauri/src/pipeline/wall_graph.rs`** — 新增 `merge_parallel_segments`：按 Y 聚类水平线段/按 X 聚类垂直线段（30px 阈值），每簇输出一条中线段；在 `build_wall_graph` 中 Step 4 后执行并重新合并共线段
- **`src-tauri/src/ai/prompts.rs`** — 两个 prompt 的 JSON schema 新增 `dimension_annotations` 字段；Scale 检测指令更严格；新增 Dimension Annotations 段落强制报告所有可见标注数字
- **`src-tauri/src/pipeline/test_e2e.rs`** — Mock VLM 增加 `dimension_annotations`；新增 scale mpp 范围断言 [0.003, 0.02]

### Pipeline V2: Scale Detection & Room Polygon Fix

修复尺度检测幻觉、房间分割错误和家具规划质量门控。

**问题:** VLM 总是返回 `scale_info: {detected: true, meters_per_pixel: 0.02}`，实际应为 ~0.0076，导致模型尺寸放大 2.6 倍（22×17m 而非 8.4×6m）。房间多边形生成使用全局 X/Y 独立网格分割，当多个质心共享 X 坐标时（如卧室 [700,300] 和卫生间 [700,600]），所有房间都被 Y 中点切割，导致卫生间面积 92.4m² 而非实际 9.36m²。家具规划在尺度不准确时过早执行，放大错误观感。

**改进结果 (plane-design-3.png):**

| 指标 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| 尺度 mpp | 0.02 (幻觉) | 0.0075 + CV回退 | 正确范围 |
| 卫生间面积 | 92.4 m² | ~9.4 m² | 正确分割 |
| 客厅分割 | 被切碎 | 左侧完整矩形 | 修复 |
| 家具质量门控 | scale ≥ 0.7 | scale ≥ 0.9 | 更严格 |

#### Changed

- **`src-tauri/src/pipeline/plan_graph.rs`** — `extract_scale_candidates` 新增图像尺寸参数和合理性检查：如果 mpp 导致模型任一维度 >50m 或 <0.5m，置信度降至 0.2；overall_dimensions 候选同样检查；新增 CV 回退尺度（`mpp = 20.0 / 最大墙体范围`，置信度 0.35）；重写 `generate_faces_from_centroids` 为基于 X 聚类的分割：先按 X 坐标聚类（50px 容差），同簇内按 Y 中点细分，单房间簇占满高度
- **`src-tauri/src/pipeline/convert.rs`** — 默认 mpp 从 0.02 改为 0.0075
- **`src-tauri/src/ai/prompts.rs`** — 严格化尺度检测指令：仅当可见至少两个带尺寸线的标注数字时才设 detected=true，否则必须设 detected=false
- **`src-tauri/src/pipeline/mod.rs`** — 家具质量门控：scale_score 门槛从 ≥0.7 提高到 ≥0.9
- **`src-tauri/src/pipeline/furniture.rs`** — 新增房间面积合理性过滤：跳过面积 <1.0m² 或 >100m² 的房间
- **`src-tauri/src/pipeline/test_e2e.rs`** — 新增尺度验证断言：任何房间最大维度 <30m

### Pipeline V2: Distance-Based Alignment Scoring

使用基于距离的对齐度量替代像素重叠比较，解决墙体厚度渲染不精确导致 Precision 偏低的问题。

**问题:** 像素级重叠比较要求渲染的墙体线段与掩膜像素精确匹配，但 `imageproc::draw_line_segment` 的 Bresenham 渲染与原始掩膜像素存在系统性偏移。自适应厚度测量（中点扫描）受交叉点处墙体加宽影响，导致渲染像素数约为掩膜的 2 倍，Precision 仅 0.44。

**改进结果 (plane-design-3.png):**

| 指标 | 优化前 (像素重叠) | 优化后 (距离度量) | 变化 |
|---|---|---|---|
| IoU | 0.436 | 0.605 | +39% |
| Precision | 0.438 | 0.817 | +87% |
| Recall | 0.986 | 0.836 | -15% |
| Overall | 0.711 | 0.784 | +10% |
| image_alignment_score | 0.71 | 0.78 | 突破 0.75 质量门控 |
| needs_user_review | true | false | 通过质量门控 |

#### Changed

- **`src-tauri/src/pipeline/alignment.rs`** — 新增基于 BFS 距离变换的对齐度量：将线段渲染为 1px 细线，通过 BFS 计算每个像素到最近线段/掩膜的距离；容忍度 D=5px（约半墙宽）；Recall = 掩膜像素中距线段 ≤D 的比例，Precision = 线段像素中距掩膜 ≤D 的比例，IoU = 双向覆盖区域的交并比；保留自适应厚度渲染作为调试可视化
- **`src-tauri/src/pipeline/validate.rs`** — 修改 `needs_user_review` 逻辑：仅在有错误或对齐分数 < 0.75 时触发审查，警告（如孤立墙体）不再单独触发；自适应厚度：使用中点间采样（3 点，0.3/0.5/0.7），取中位数，避免交叉点加宽影响

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
