---
sidebar_position: 1
title: Development Setup
description: How to set up a local development environment for Planova
---

# Development Setup

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| **Node.js** | 20+ | LTS recommended |
| **pnpm** | latest | Package manager for the frontend |
| **Rust** | 1.77.2+ | Matches `rust-version` in `Cargo.toml` |
| **Cargo** | bundled with Rust | Build toolchain for the Tauri backend |

Additional system dependencies for Tauri (Linux):

```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Arch Linux
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
  libappindicator-gtk3 librsvg
```

## Clone and Install

```bash
git clone https://github.com/xuranus/planova.git
cd planova

# Install frontend dependencies
pnpm install
```

## Development Mode

Start the full application in development mode (Vite dev server + Tauri native window):

```bash
pnpm tauri dev
```

This command:

1. Starts the **Vite** dev server on `localhost:1420` with Hot Module Replacement (HMR).
2. Compiles the Rust backend with `cargo` and launches the Tauri webview window.
3. Watches for changes in both frontend and backend sources.

Frontend edits (`.tsx`, `.ts`, `.css`) update instantly in the browser via HMR. Rust changes trigger a recompile and window restart.

## Debugging

### Frontend (WebView)

- Right-click inside the Tauri window and select **Inspect Element** to open Chromium DevTools.
- Console logs, network requests, and React DevTools work as expected.

### Rust Backend

Set the `RUST_LOG` environment variable to control log verbosity:

```bash
RUST_LOG=info pnpm tauri dev     # info-level logs
RUST_LOG=debug pnpm tauri dev    # debug-level logs
```

Log files are written to the platform-specific app data directory:

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/planova/logs/` |
| macOS | `~/Library/Application Support/planova/logs/` |
| Windows | `%APPDATA%\planova\logs\` |

In debug builds, the `tauri-plugin-log` crate also writes to stdout at `info` level and above.

## Build for Production

```bash
pnpm tauri build
```

Produces platform-specific installers in `src-tauri/target/release/bundle/`.

## Project Structure

```
planova/
  src/                        # Frontend (React + TypeScript)
    components/               # Reusable UI components
      layout/                 # Topbar, StatusBar, etc.
      viewer/                 # 3D viewer and toolbar
    pages/                    # Route-level page components
    stores/                   # Zustand state stores
    types/                    # TypeScript type definitions
    i18n/                     # Internationalization (en-US, zh-CN)
    hooks/                    # Custom React hooks
  src-tauri/                  # Backend (Rust + Tauri)
    src/
      commands/               # Tauri IPC command handlers
        projects.rs           # Project CRUD
        files.rs              # File upload and management
        scenes.rs             # Scene CRUD
        tasks.rs              # Pipeline task management
        settings.rs           # Settings and LLM connection test
        renders.rs            # AI image export
      pipeline/               # Floor plan parsing pipeline
        preprocess.rs         # Image preprocessing
        wall_mask.rs          # Wall mask extraction
        wall_graph.rs         # Wall skeleton graph
        plan_graph.rs         # Room graph, scale detection
        convert.rs            # PlanGraph -> HomeSceneJSON
        repair.rs             # Scene geometry repair
        validate.rs           # Quality scoring
        alignment.rs          # Wall alignment metrics
        test_e2e.rs           # End-to-end pipeline tests
      ai/                     # LLM client (VLM, image gen)
      db.rs                   # SQLite database setup
      models.rs               # Shared data structs
      settings.rs             # Settings file I/O
      storage.rs              # File storage utilities
      util.rs                 # ID generation, helpers
    Cargo.toml
  assets/                     # Static assets (test images, etc.)
  wiki/                       # This documentation site
```
