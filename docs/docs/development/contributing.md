---
sidebar_position: 3
title: Contributing
description: Code style, conventions, and workflow for Planova contributors
---

# Contributing

## Code Style

### Rust

- **Formatter**: `rustfmt` (default settings). Run with `cargo fmt` before committing.
- **Linter**: `clippy`. Run with `cargo clippy -- -D warnings` to catch common mistakes.
- **Naming**: `snake_case` for functions, variables, and modules. `PascalCase` for types and traits.

### TypeScript

- **Formatter**: Prettier (configured in the project).
- **Linter**: ESLint (configured in the project). Run with `pnpm lint`.
- **Naming**: `camelCase` for variables, functions, and properties. `PascalCase` for components, types, and interfaces.

## Frontend Patterns

### Components

All components are **functional components** using React hooks. No class components.

```tsx
// Good
export function ViewerToolbar({ sceneId }: ViewerToolbarProps) {
  const [active, setActive] = useState(false)
  // ...
}

// Avoid
export class ViewerToolbar extends React.Component { ... }
```

### State Management

Global state uses **Zustand** stores. Each domain has its own store:

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

### Tauri IPC Calls

Use the `@tauri-apps/api` `invoke` function to call Rust commands:

```ts
import { invoke } from '@tauri-apps/api/core'

const project = await invoke<ProjectResponse>('get_project', {
  projectId: 'abc123',
})
```

## Git Workflow

### Branches

- `master` -- Main branch. Always deployable.
- Feature branches -- `feat/<short-description>`
- Bug fix branches -- `fix/<short-description>`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add wall alignment overlay toggle
fix: correct scale mpp when VLM returns implausible value
refactor: extract wall mask logic into separate module
docs: add pipeline testing guide
chore: update Tauri to 2.5.3
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`.

## Pull Request Checklist

Before submitting a PR, verify:

- [ ] **Rust builds without warnings**: `cargo clippy -- -D warnings`
- [ ] **Rust formatted**: `cargo fmt --check`
- [ ] **TypeScript builds**: `pnpm build`
- [ ] **Lint passes**: `pnpm lint`
- [ ] **Pipeline tests pass**: `cargo test --lib test_pipeline_e2e`
- [ ] **No new `console.log`** left in production code
- [ ] **Types are correct** -- no `any` types without justification
- [ ] **Commit messages** follow conventional commits format

## Adding a New Tauri Command

1. Create the command function in the appropriate file under `src-tauri/src/commands/`.

```rust
#[tauri::command]
pub fn my_new_command(
    state: State<'_, AppState>,
    param: String,
) -> Result<MyResponse, String> {
    // ...
}
```

2. Register it in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands
    commands::my_module::my_new_command,
])
```

3. Define the TypeScript types in `src/types/` and call it from the frontend:

```ts
const result = await invoke<MyResponse>('my_new_command', { param: 'value' })
```

## Adding a New Pipeline Step

1. Create a new module file in `src-tauri/src/pipeline/`.
2. Export the module in `src-tauri/src/pipeline/mod.rs`.
3. Integrate it into the pipeline flow in `run_pipeline()` or the relevant orchestrator.
4. Add an E2E test assertion in `test_e2e.rs` if the step produces measurable output.
