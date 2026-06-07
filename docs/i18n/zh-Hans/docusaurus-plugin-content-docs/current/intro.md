---
sidebar_position: 1
title: 简介
description: Planova -- AI 驱动的户型图转 3D 室内场景工具
keywords: [floor plan, 3D, interior design, AI, Tauri]
---

# 欢迎使用 Planova

**Planova** 是一款桌面应用，能够利用 AI 将 2D 户型图转换为可漫游的 3D 室内场景。上传 JPG、PNG 或 PDF 格式的户型图，即可获得一个带完整家具和材质的 3D 模型，支持漫游浏览、编辑和导出。

## 功能特性

- **户型图解析** -- AI 视觉模型从图像中提取房间边界、墙体、门和窗户
- **自动家具布置** -- LLM 驱动的家具规划，匹配你选择的室内风格
- **3D 查看器** -- 支持环绕、漫游和编辑模式，自由探索场景
- **场景检查器** -- 在最终确认前查看解析质量评分和调试叠加层
- **风格预设** -- 六种内置风格：现代奢华、奶油风、新中式、侘寂风、工业风、北欧风
- **AI 渲染** -- 使用图像生成模型对任意房间视角生成照片级真实感渲染图
- **GLB 导出** -- 将 3D 场景导出为标准 GLB 文件，可在其他工具中使用
- **多语言** -- UI 完整支持中文和英文

![Planova Screenshot](/img/Screenshot_20260508_195100.png)

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri v2 | 2.9 |
| 前端 | React | 19 |
| 3D 渲染 | Three.js (via React Three Fiber) | 0.184 |
| 样式 | Tailwind CSS | v4 |
| 状态管理 | Zustand | 5 |
| 数据库 | SQLite (rusqlite) | -- |
| 异步运行时 | Tokio | 1 |
| 构建工具 | Vite | 8 |
| 包管理器 | pnpm | -- |

## 工作原理

Planova 使用多阶段流水线将户型图图像转换为 3D 场景：

```mermaid
flowchart LR
    A[Floor Plan Image] --> B[VLM Parse]
    B --> C[Normalize]
    C --> D[Repair]
    D --> E[Validate]
    E --> F[3D Render]

    style A fill:#4f46e5,color:#fff
    style F fill:#10b981,color:#fff
```

1. **图像输入** -- 上传户型图（JPG/PNG/PDF）
2. **VLM 解析** -- 视觉语言模型提取房间、墙体、门和窗户
3. **标准化** -- 将原始数据转换为具有真实世界尺寸的标准化场景图
4. **修复** -- 自动修复几何问题（间隙、重叠、不对齐）
5. **验证** -- 对场景进行质量评分；你可以审查并确认或重试
6. **3D 渲染** -- 放置家具、应用材质，生成可漫游的场景

:::info 流水线模式
Planova 支持两种流水线模式：**混合 CV+VLM**（默认），结合经典计算机视觉与 VLM 以获得更高精度；以及**传统**模式，由 VLM 全权处理。你可以在设置中切换。
:::
