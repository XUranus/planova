---
sidebar_position: 1
title: 安装指南
description: 如何从源码安装和运行 Planova
keywords: [install, setup, development, build]
---

# 安装指南

Planova 基于 Tauri 构建，因此你需要同时准备 Rust 工具链和 Node.js 环境。

## 前置要求

在开始之前，请确保已安装以下工具：

| 工具 | 最低版本 | 检查命令 |
|------|----------|----------|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| Rust 工具链 | 1.77.2+ | `rustc --version` |
| 系统依赖 | -- | 见下文 |

:::warning 系统依赖
Tauri 需要平台特定的系统库。在 Linux 上你可能需要安装 `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev` 和 `patchelf` 等包。请参阅 [Tauri 前置要求指南](https://tauri.app/start/prerequisites/) 了解你的操作系统所需内容。
:::

## 克隆仓库

```bash
git clone https://github.com/your-org/planova.git
cd planova
```

## 安装依赖

使用 pnpm 安装前端依赖：

```bash
pnpm install
```

此命令也会安装 Tauri CLI 和所有前端包。

## 开发模式

以开发模式启动应用，支持热重载：

```bash
pnpm tauri dev
```

此命令将会：
1. 启动 React 前端的 Vite 开发服务器
2. 编译并启动 Tauri（Rust）后端
3. 打开 Planova 桌面窗口

首次运行可能需要几分钟，因为 Cargo 需要编译所有依赖。

## 生产构建

构建用于分发的发布版本：

```bash
pnpm tauri build
```

输出的二进制文件将位于 `src-tauri/target/release/bundle/` 目录下（平台特定格式：`.msi`、`.dmg`、`.AppImage` 等）。

:::tip 构建时间
首次生产构建会较慢，因为 Cargo 需要在 release 模式下编译所有 crate。得益于增量编译，后续构建会快得多。
:::

## 常见问题排查

### "command not found: pnpm"

全局安装 pnpm：

```bash
npm install -g pnpm
```

或使用 `corepack`（Node.js 20+ 自带）：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### Cargo 构建失败，提示缺少系统库

请确保已安装你的平台所需的所有 [Tauri 前置依赖](https://tauri.app/start/prerequisites/)。在 Ubuntu/Debian 上：

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

### "Rust version too old"

更新你的 Rust 工具链：

```bash
rustup update stable
```

Planova 要求 Rust 1.77.2 或更高版本。

### 开发时端口冲突

如果 Vite 报告端口冲突，你可以指定其他端口：

```bash
VITE_PORT=3001 pnpm tauri dev
```

### 应用窗口空白

检查终端输出中的错误信息。常见原因：
- 缺少 LLM API 密钥（首次启动后在设置中配置）
- 前端构建错误（查看 Vite 开发服务器输出）
