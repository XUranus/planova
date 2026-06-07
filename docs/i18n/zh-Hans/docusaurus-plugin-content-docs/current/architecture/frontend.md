---
sidebar_position: 3
title: 前端架构
---

# 前端架构

Planova 是一个 Tauri 桌面应用。前端是一个 React 单页应用，使用 Tailwind CSS 进行样式管理，Zustand 进行状态管理，React Three Fiber 进行 3D 渲染。

## 组件层级

UI 围绕一个持久化的 `AppShell` 布局组织，包裹所有路由：

```
App
 └─ TooltipProvider
     └─ HashRouter
         └─ AppShell
             ├─ Sidebar          (navigation rail)
             └─ Flex column
                 ├─ Topbar       (breadcrumb, actions)
                 ├─ <Outlet />   (page content)
                 └─ StatusBar    (connection status, task progress)
```

`AppShell`（`src/components/layout/AppShell.tsx`）使用 React Router 的 `<Outlet />` 在全视口 flex 布局中渲染当前页面。侧边栏是固定宽度的导航栏；顶部栏和状态栏占据剩余的水平空间。

## 页面

四个页面均通过 `React.lazy` 在 `src/App.tsx` 中懒加载：

| 路由 | 组件 | 描述 |
|------|------|------|
| `/` | `ProjectDashboard` | 项目卡片网格，支持创建/编辑/删除操作 |
| `/projects/:id` | `ProjectDetail` | 分栏编辑器：3D 查看器（左侧）+ 可调整大小的右侧面板 |
| `/projects/:id/upload` | `UploadPage` | 文件上传（支持拖放），触发后端解析 |
| `/settings` | `SettingsPage` | API 密钥配置、LLM 提供商设置 |

### ProjectDetail 分栏面板

`ProjectDetail`（`src/pages/ProjectDetail.tsx`）是主要的编辑界面。它渲染一个可调整大小的双栏布局：

- **左栏** -- `SceneViewer`（3D 画布），顶部叠加 `ViewerToolbar`，条件渲染 `MaterialPanel` / `ReviewGate`。
- **右栏** -- `RightPanel`，带标签页界面（场景、检视器、纹理）。两栏之间的拖拽手柄允许用户实时调整面板宽度。

当场景的 `parse_quality.needs_user_review` 标志被设置时，`ReviewGate` 组件会拦截视图，展示质量分数并提供接受或重试解析的选项。

## 查看器组件

所有查看器相关组件位于 `src/components/viewer/` 下：

| 组件 | 职责 |
|------|------|
| `SceneViewer` | 顶层 `<Canvas>`（来自 React Three Fiber）。设置灯光、相机控制器、SSAO 后处理，并挂载 `HomeSceneMesh`。 |
| `HomeSceneMesh` | React 组件，当 `homeScene` 数据变更时调用引擎的 `buildScene()`。将生成的 `THREE.Group` 添加到 R3F 场景中，并在卸载时清理。 |
| `ViewerToolbar` | 画布上方的浮动工具栏，包含模式切换（轨道/漫游/编辑）、天花板可见性、相机重置和物体变换控件。 |
| `RightPanel` | 标签页侧面板，包含 `SceneInspector`、`TexturePanel` 和场景列表。 |
| `SceneInspector` | 显示解析后的场景数据：房间、墙体、开洞、物体、材质、灯光、相机以及解析质量徽章。使用 `FieldInputs` 进行行内编辑，使用 `ItemCards` 进行分类展示。 |
| `MaterialPanel` | 查看器区域中显示的行内材质选择器，用于快速表面替换。 |
| `TexturePanel` | 程序化纹理预设网格，带实时预览缩略图。 |
| `ReviewGate` | 质量门控叠加层，在解析的场景需要用户确认时显示。展示各维度分数并提供接受/重试操作。 |
| `WalkControls` | 漫游模式下激活的第一人称相机控制器。捕获指针锁定并映射 WASD + 鼠标到移动。 |
| `ObjectEditor` | 选中家具物体的 Gizmo 包装器。支持平移和旋转模式，将变换回写到 `sceneStore`。 |

检视器子组件（`src/components/viewer/inspector/`）：

- `FieldInputs` -- 可复用的标签输入组件（数字、文本、颜色、向量 2/3、选择），带 `SectionWrapper` 折叠面板。
- `ItemCards` -- 各场景实体的类型化卡片组件：`ObjectCard`、`RoomCard`、`WallCard`、`OpeningCard`、`MaterialCard`、`LightCard`、`CameraCard`。

## 状态管理（Zustand）

所有 store 定义在 `src/stores/` 中，使用 Zustand 的 `create` 函数。

### projectStore

`src/stores/projectStore.ts`

管理项目和文件列表。每个变更操作（`syncCreateProject`、`syncUpdateProject`、`syncDeleteProject`、`syncUploadFile`、`syncDeleteFile`）遵循**同步优先模式**：首先调用 Tauri 后端 API，如果调用失败（后端不可用），则回退到本地创建或更新条目（使用 UUID 和时间戳）。这为应用提供了离线可用模式。

关键状态：

- `projects: Project[]`
- `files: Record<string, UploadedFile[]>` -- 按项目 ID 索引
- `currentProjectId: string | null`

### sceneStore

`src/stores/sceneStore.ts`

持有当前加载的 3D 场景和审核门控流程。

关键状态：

- `homeScene: HomeSceneJSON | null` -- 由 `buildScene()` 消费的场景数据
- `builtObjects: BuiltObject[]` -- 物体构建器的输出，供 `ObjectEditor` 使用
- `builtGroup: THREE.Group | null` -- Three.js 场景中的根 Group
- `scenes: SceneInfo[]` -- 当前项目的所有场景
- `activeSceneId: string | null`
- `pendingReviewSceneId`、`reviewSceneData`、`reviewFileId` -- 审核门控状态
- `lastEditorChange: number` -- 用于打破 JSON 编辑器 / 3D 同步循环的时间戳

关键操作：`fetchScenes`、`loadScene`、`acceptReview`、`retryParse`、`saveScene`、`loadTestScene`。

### viewerStore

`src/stores/viewerStore.ts`

控制 3D 查看器的交互状态。

关键状态：

- `mode: 'orbit' | 'walk' | 'edit'`
- `selectedObjectId: string | null`
- `transformMode: 'translate' | 'rotate'`
- `showCeilings: boolean`
- `orbitControls` -- R3F OrbitControls 实例的引用
- `resetCameraToken: number` -- 递增计数器，触发 `SceneViewer` 中的相机重置
- `hoveredCategory`、`hoverScreenPos` -- 悬浮提示状态

### toastStore

`src/stores/toastStore.ts`

简单的通知队列。`addToast` 推送一个带有自动消失计时器（默认 4 秒）的 toast。便捷辅助函数 `toast.success()`、`toast.error()`、`toast.info()`、`toast.warning()` 导出供 React 组件外部使用。

### taskStore

`src/stores/taskStore.ts`

跟踪异步后端任务（场景生成）。`startGeneration` 通过 API 创建任务并立即开始轮询。`pollTask` 使用 1500ms 间隔的 `setInterval`，每次 tick 更新 `activeTasks[taskId]`。当任务达到终态（`completed`、`failed`、`cancelled`）时轮询自动停止。

## API 层

所有 Tauri `invoke` 包装器位于 `src/api/`：

| 文件 | 导出 |
|------|------|
| `projects.ts` | `getProjects`、`createProject`、`updateProject`、`deleteProject` |
| `files.ts` | `getFiles`、`uploadFileObject`、`deleteFile`、`retryParse` |
| `scenes.ts` | `listScenes`、`getScene`、`updateScene` |
| `tasks.ts` | `startGeneration`、`getTask`、`getPipelineArtifacts` |
| `settings.ts` | `getSettings`、`saveSettings` |

每个函数调用 `@tauri-apps/api/core` 的 `invoke` 并返回类型化结果。错误处理委托给调用者（通常是 Zustand store 的操作）。

## 路由

应用使用 React Router 的 `HashRouter`（基于哈希的路由，兼容 Tauri）。路由树是扁平的：

```
/                        → ProjectDashboard
/projects/:id            → ProjectDetail
/projects/:id/upload     → UploadPage
/settings                → SettingsPage
```

所有页面组件通过 `React.lazy` 懒加载，fallback 为 `null`（路由级别无加载 spinner；各页面自行管理加载状态）。

## UI 工具包

- **shadcn/ui** -- 预构建的无样式基础组件（`Button`、`Card`、`Dialog`、`Input`、`Tabs`、`Tooltip`、`DropdownMenu`、`ScrollArea`、`Separator`、`Skeleton`、`Textarea`、`Toaster`）。位于 `src/components/ui/`。
- **Tailwind CSS** -- 工具类优先的样式方案；所有布局和视觉设计使用行内 Tailwind 类。
- **Radix UI** -- shadcn/ui 底层的无头可访问性层。
- **Lucide React** -- 应用中使用的图标库。
- **i18next** -- 国际化支持，`src/i18n/locales/` 中包含 `en-US` 和 `zh-CN` locale 文件。
