---
sidebar_position: 1
title: Installation
description: How to install and run Planova from source
keywords: [install, setup, development, build]
---

# Installation

Planova is built with Tauri, which means you need both a Rust toolchain and a Node.js environment.

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Minimum Version | Check Command |
|------|----------------|---------------|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Rust toolchain | 1.77.2+ | `rustc --version` |
| System dependencies | -- | See below |

:::warning System Dependencies
Tauri requires platform-specific system libraries. On Linux you may need packages like `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, and `patchelf`. See the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for your OS.
:::

## Clone the Repository

```bash
git clone https://github.com/your-org/planova.git
cd planova
```

## Install Dependencies

Install the frontend dependencies with pnpm:

```bash
pnpm install
```

This also installs the Tauri CLI and all frontend packages.

## Development Mode

Launch the app in development mode with hot-reload:

```bash
pnpm tauri dev
```

This will:
1. Start the Vite dev server for the React frontend
2. Compile and launch the Tauri (Rust) backend
3. Open the Planova desktop window

The first run may take a few minutes while Cargo compiles all dependencies.

## Production Build

Build a release binary for distribution:

```bash
pnpm tauri build
```

The output binary will be placed in `src-tauri/target/release/bundle/` (platform-specific format: `.msi`, `.dmg`, `.AppImage`, etc.).

:::tip Build Time
The first production build is slow because Cargo compiles all crates in release mode. Subsequent builds are much faster thanks to incremental compilation.
:::

## Troubleshooting

### "command not found: pnpm"

Install pnpm globally:

```bash
npm install -g pnpm
```

Or use `corepack` (ships with Node.js 20+):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### Cargo build fails with missing system libraries

Make sure you have installed all [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform. On Ubuntu/Debian:

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### "Rust version too old"

Update your Rust toolchain:

```bash
rustup update stable
```

Planova requires Rust 1.77.2 or newer.

### Port conflict during development

If Vite reports a port conflict, you can specify a different port:

```bash
VITE_PORT=3001 pnpm tauri dev
```

### App window is blank

Check the terminal output for errors. Common causes:
- Missing LLM API keys (configure them in Settings after first launch)
- Frontend build error (check the Vite dev server output)
