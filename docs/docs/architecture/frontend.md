---
sidebar_position: 3
title: Frontend Architecture
---

# Frontend Architecture

Planova is a Tauri desktop application. The frontend is a React single-page application styled with Tailwind CSS, using Zustand for state management and React Three Fiber for 3D rendering.

## Component Hierarchy

The UI is organized around a persistent `AppShell` layout that wraps every route:

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

`AppShell` (`src/components/layout/AppShell.tsx`) uses React Router's `<Outlet />` to render the active page inside a full-viewport flex layout. The sidebar is a fixed-width navigation rail; the top bar and status bar span the remaining horizontal space.

## Pages

All four pages are lazy-loaded via `React.lazy` in `src/App.tsx`:

| Route | Component | Description |
|---|---|---|
| `/` | `ProjectDashboard` | Grid of project cards with create/edit/delete actions |
| `/projects/:id` | `ProjectDetail` | Split-pane editor: 3D viewer (left) + resizable right panel |
| `/projects/:id/upload` | `UploadPage` | File upload with drag-and-drop, triggers backend parsing |
| `/settings` | `SettingsPage` | API key configuration, LLM provider settings |

### ProjectDetail Split Pane

`ProjectDetail` (`src/pages/ProjectDetail.tsx`) is the primary editing surface. It renders a resizable two-column layout:

- **Left column** -- `SceneViewer` (the 3D canvas) with `ViewerToolbar` overlaid at the top and `MaterialPanel` / `ReviewGate` conditionally rendered.
- **Right column** -- `RightPanel` with a tabbed interface (Scenes, Inspector, Textures). A drag handle between the columns lets the user resize the panel width in real time.

When a scene's `parse_quality.needs_user_review` flag is set, the `ReviewGate` component intercepts the view and presents quality scores with options to accept or retry the parse.

## Viewer Components

All viewer-related components live under `src/components/viewer/`:

| Component | Role |
|---|---|
| `SceneViewer` | Top-level `<Canvas>` from React Three Fiber. Sets up lighting, camera controller, SSAO post-processing, and mounts `HomeSceneMesh`. |
| `HomeSceneMesh` | React component that calls `buildScene()` from the engine whenever `homeScene` data changes. Adds the resulting `THREE.Group` to the R3F scene and cleans up on unmount. |
| `ViewerToolbar` | Floating toolbar above the canvas with mode toggle (orbit / walk / edit), ceiling visibility, camera reset, and object transform controls. |
| `RightPanel` | Tabbed side panel hosting `SceneInspector`, `TexturePanel`, and a scenes list. |
| `SceneInspector` | Displays parsed scene data: rooms, walls, openings, objects, materials, lights, cameras, and a parse-quality badge. Uses `FieldInputs` for inline editing and `ItemCards` for categorized display. |
| `MaterialPanel` | Inline material picker shown in the viewer area for quick surface swaps. |
| `TexturePanel` | Grid of procedural texture presets with live preview thumbnails. |
| `ReviewGate` | Quality-gate overlay shown when a parsed scene needs user confirmation. Displays per-dimension scores and offers accept / retry actions. |
| `WalkControls` | First-person camera controller activated in walk mode. Captures pointer lock and maps WASD + mouse to movement. |
| `ObjectEditor` | Gizmo wrapper for selected furniture objects. Supports translate and rotate modes, writes transforms back to `sceneStore`. |

Inspector sub-components (`src/components/viewer/inspector/`):

- `FieldInputs` -- reusable labeled inputs (number, text, color, vector2/3, select) with `SectionWrapper` accordion.
- `ItemCards` -- typed card components for each scene entity: `ObjectCard`, `RoomCard`, `WallCard`, `OpeningCard`, `MaterialCard`, `LightCard`, `CameraCard`.

## State Management (Zustand)

All stores are defined in `src/stores/` using Zustand's `create` function.

### projectStore

`src/stores/projectStore.ts`

Manages the project and file lists. Every mutating action (`syncCreateProject`, `syncUpdateProject`, `syncDeleteProject`, `syncUploadFile`, `syncDeleteFile`) follows a **sync-first pattern**: it calls the Tauri backend API, and if the call fails (backend unavailable), it falls back to creating or updating entries locally with UUIDs and timestamps. This gives the app an offline-capable mode.

Key state:

- `projects: Project[]`
- `files: Record<string, UploadedFile[]>` -- keyed by project ID
- `currentProjectId: string | null`

### sceneStore

`src/stores/sceneStore.ts`

Owns the currently loaded 3D scene and the review-gate flow.

Key state:

- `homeScene: HomeSceneJSON | null` -- the scene data consumed by `buildScene()`
- `builtObjects: BuiltObject[]` -- output of the object builder, used by `ObjectEditor`
- `builtGroup: THREE.Group | null` -- the root group in the Three.js scene
- `scenes: SceneInfo[]` -- all scenes for the active project
- `activeSceneId: string | null`
- `pendingReviewSceneId`, `reviewSceneData`, `reviewFileId` -- review-gate state
- `lastEditorChange: number` -- timestamp used to break JSON-editor / 3D-sync loops

Key actions: `fetchScenes`, `loadScene`, `acceptReview`, `retryParse`, `saveScene`, `loadTestScene`.

### viewerStore

`src/stores/viewerStore.ts`

Controls the 3D viewer's interactive state.

Key state:

- `mode: 'orbit' | 'walk' | 'edit'`
- `selectedObjectId: string | null`
- `transformMode: 'translate' | 'rotate'`
- `showCeilings: boolean`
- `orbitControls` -- ref to the R3F OrbitControls instance
- `resetCameraToken: number` -- incrementing counter that triggers camera reset in `SceneViewer`
- `hoveredCategory`, `hoverScreenPos` -- hover tooltip state

### toastStore

`src/stores/toastStore.ts`

Simple notification queue. `addToast` pushes a toast with an auto-dismiss timer (default 4 seconds). Convenience helpers `toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()` are exported for use outside React components.

### taskStore

`src/stores/taskStore.ts`

Tracks asynchronous backend tasks (scene generation). `startGeneration` creates a task via the API and immediately starts polling. `pollTask` uses `setInterval` at 1500ms, updating `activeTasks[taskId]` on each tick. Polling stops automatically when the task reaches a terminal status (`completed`, `failed`, `cancelled`).

## API Layer

All Tauri `invoke` wrappers live in `src/api/`:

| File | Exports |
|---|---|
| `projects.ts` | `getProjects`, `createProject`, `updateProject`, `deleteProject` |
| `files.ts` | `getFiles`, `uploadFileObject`, `deleteFile`, `retryParse` |
| `scenes.ts` | `listScenes`, `getScene`, `updateScene` |
| `tasks.ts` | `startGeneration`, `getTask`, `getPipelineArtifacts` |
| `settings.ts` | `getSettings`, `saveSettings` |

Each function calls `invoke` from `@tauri-apps/api/core` and returns typed results. Error handling is delegated to the caller (typically the Zustand store actions).

## Routing

The app uses React Router with a `HashRouter` (hash-based routing for Tauri compatibility). The route tree is flat:

```
/                        → ProjectDashboard
/projects/:id            → ProjectDetail
/projects/:id/upload     → UploadPage
/settings                → SettingsPage
```

All page components are lazy-loaded via `React.lazy` with a `null` fallback (no loading spinner at the route level; individual pages manage their own loading states).

## UI Toolkit

- **shadcn/ui** -- pre-built, unstyled primitives (`Button`, `Card`, `Dialog`, `Input`, `Tabs`, `Tooltip`, `DropdownMenu`, `ScrollArea`, `Separator`, `Skeleton`, `Textarea`, `Toaster`). Located in `src/components/ui/`.
- **Tailwind CSS** -- utility-first styling; all layout and visual design is inline Tailwind classes.
- **Radix UI** -- headless accessibility layer under shadcn/ui.
- **Lucide React** -- icon library used throughout the app.
- **i18next** -- internationalization with `en-US` and `zh-CN` locale files in `src/i18n/locales/`.
