---
sidebar_position: 3
title: 贡献指南
description: Planova 贡献者的代码风格、规范和工作流程
---

# 贡献指南

## 代码风格

### Rust

- **格式化工具**：`rustfmt`（默认配置）。提交前运行 `cargo fmt`。
- **代码检查**：`clippy`。运行 `cargo clippy -- -D warnings` 以捕获常见错误。
- **命名规范**：函数、变量和模块使用 `snake_case`；类型和 trait 使用 `PascalCase`。

### TypeScript

- **格式化工具**：Prettier（已在项目中配置）。
- **代码检查**：ESLint（已在项目中配置）。运行 `pnpm lint`。
- **命名规范**：变量、函数和属性使用 `camelCase`；组件、类型和接口使用 `PascalCase`。

## 前端模式

### 组件

所有组件均为使用 React hooks 的**函数式组件**，不使用 class 组件。

```tsx
// 推荐
export function ViewerToolbar({ sceneId }: ViewerToolbarProps) {
  const [active, setActive] = useState(false)
  // ...
}

// 避免
export class ViewerToolbar extends React.Component { ... }
```

### 状态管理

全局状态使用 **Zustand** store。每个领域拥有独立的 store：

```ts
import { create } from 'zustand'

interface ProjectStore {
  projects: Project[]
  loadProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  loadProjects: async () => {
    const data = await invoke('list_projects')
    set({ projects: data })
  },
}))
```

### Tauri IPC 调用

使用 `@tauri-apps/api` 的 `invoke` 函数调用 Rust 命令：

```ts
import { invoke } from '@tauri-apps/api/core'

const project = await invoke<ProjectResponse>('get_project', {
  projectId: 'abc123',
})
```

## Git 工作流程

### 分支

- `master` -- 主分支，始终保持可部署状态。
- 功能分支 -- `feat/<简短描述>`
- 修复分支 -- `fix/<简短描述>`

### 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: add wall alignment overlay toggle
fix: correct scale mpp when VLM returns implausible value
refactor: extract wall mask logic into separate module
docs: add pipeline testing guide
chore: update Tauri to 2.5.3
```

类型：`feat`、`fix`、`refactor`、`docs`、`chore`、`test`、`perf`。

## Pull Request 检查清单

提交 PR 前请确认：

- [ ] **Rust 构建无警告**：`cargo clippy -- -D warnings`
- [ ] **Rust 代码已格式化**：`cargo fmt --check`
- [ ] **TypeScript 构建成功**：`pnpm build`
- [ ] **Lint 通过**：`pnpm lint`
- [ ] **流水线测试通过**：`cargo test --lib test_pipeline_e2e`
- [ ] **无新增 `console.log`** 遗留在生产代码中
- [ ] **类型正确** -- 无无理由使用 `any` 类型的情况
- [ ] **提交信息** 遵循 conventional commits 格式

## 添加新的 Tauri 命令

1. 在 `src-tauri/src/commands/` 下的对应文件中创建命令函数。

```rust
#[tauri::command]
pub fn my_new_command(
    state: State<'_, AppState>,
    param: String,
) -> Result<MyResponse, String> {
    // ...
}
```

2. 在 `src-tauri/src/lib.rs` 中注册该命令：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 已有命令
    commands::my_module::my_new_command,
])
```

3. 在 `src/types/` 中定义 TypeScript 类型，然后从前端调用：

```ts
const result = await invoke<MyResponse>('my_new_command', { param: 'value' })
```

## 添加新的流水线步骤

1. 在 `src-tauri/src/pipeline/` 下创建新的模块文件。
2. 在 `src-tauri/src/pipeline/mod.rs` 中导出该模块。
3. 在 `run_pipeline()` 或相关编排器中将其集成到流水线流程中。
4. 如果该步骤能产生可度量的输出，在 `test_e2e.rs` 中添加 E2E 测试断言。
