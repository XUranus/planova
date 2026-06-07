---
sidebar_position: 1
title: 开发环境搭建
description: 如何为 Planova 搭建本地开发环境
---

# 开发环境搭建

## 前置依赖

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| **Node.js** | 20+ | 推荐 LTS 版本 |
| **pnpm** | latest | 前端包管理器 |
| **Rust** | 1.77.2+ | 与 `Cargo.toml` 中的 `rust-version` 一致 |
| **Cargo** | 随 Rust 附带 | Tauri 后端构建工具链 |

Tauri 的额外系统依赖（Linux）：

```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget \
  file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Arch Linux
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
  libappindicator-gtk3 librsvg
```

## 克隆与安装

```bash
git clone https://github.com/xuranus/planova.git
cd planova

# 安装前端依赖
pnpm install
```

## 开发模式

以开发模式启动完整应用（Vite 开发服务器 + Tauri 原生窗口）：

```bash
pnpm tauri dev
```

该命令会：

1. 在 `localhost:1420` 启动 **Vite** 开发服务器，支持热模块替换（HMR）。
2. 使用 `cargo` 编译 Rust 后端并启动 Tauri webview 窗口。
3. 监听前端和后端源码的变更。

前端代码（`.tsx`、`.ts`、`.css`）的修改会通过 HMR 即时更新到浏览器。Rust 代码的变更会触发重新编译并重启窗口。

## 调试

### 前端（WebView）

- 在 Tauri 窗口内右键点击，选择 **Inspect Element** 即可打开 Chromium DevTools。
- Console 日志、网络请求和 React DevTools 均可正常使用。

### Rust 后端

通过设置 `RUST_LOG` 环境变量来控制日志详细程度：

```bash
RUST_LOG=info pnpm tauri dev     # info 级别日志
RUST_LOG=debug pnpm tauri dev    # debug 级别日志
```

日志文件写入平台对应的应用数据目录：

| 平台 | 路径 |
|------|------|
| Linux | `~/.local/share/planova/logs/` |
| macOS | `~/Library/Application Support/planova/logs/` |
| Windows | `%APPDATA%\planova\logs\` |

在 debug 构建中，`tauri-plugin-log` crate 也会将 `info` 及以上级别的日志输出到 stdout。

## 生产环境构建

```bash
pnpm tauri build
```

构建产物会生成在 `src-tauri/target/release/bundle/` 目录下，包含对应平台的安装包。

## 项目结构

```
planova/
  src/                        # 前端（React + TypeScript）
    components/               # 可复用 UI 组件
      layout/                 # Topbar、StatusBar 等
      viewer/                 # 3D 查看器及工具栏
    pages/                    # 路由级页面组件
    stores/                   # Zustand 状态管理
    types/                    # TypeScript 类型定义
    i18n/                     # 国际化（en-US、zh-CN）
    hooks/                    # 自定义 React hooks
  src-tauri/                  # 后端（Rust + Tauri）
    src/
      commands/               # Tauri IPC 命令处理
        projects.rs           # 项目 CRUD
        files.rs              # 文件上传与管理
        scenes.rs             # 场景 CRUD
        tasks.rs              # 流水线任务管理
        settings.rs           # 设置与 LLM 连接测试
        renders.rs            # AI 图像导出
      pipeline/               # 户型图解析流水线
        preprocess.rs         # 图像预处理
        wall_mask.rs          # 墙体掩码提取
        wall_graph.rs         # 墙体骨架图
        plan_graph.rs         # 房间图、比例尺检测
        convert.rs            # PlanGraph -> HomeSceneJSON
        repair.rs             # 场景几何修复
        validate.rs           # 质量评分
        alignment.rs          # 墙体对齐指标
        test_e2e.rs           # 端到端流水线测试
      ai/                     # LLM 客户端（VLM、图像生成）
      db.rs                   # SQLite 数据库初始化
      models.rs               # 共享数据结构
      settings.rs             # 设置文件读写
      storage.rs              # 文件存储工具
      util.rs                 # ID 生成、辅助函数
    Cargo.toml
  assets/                     # 静态资源（测试图片等）
  wiki/                       # 本文档站点
```
