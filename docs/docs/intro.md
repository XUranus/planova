---
sidebar_position: 1
title: Introduction
description: Planova -- AI-powered floor plan to 3D interior converter
keywords: [floor plan, 3D, interior design, AI, Tauri]
---

# Welcome to Planova

**Planova** is a desktop application that converts 2D floor plan images into walkable 3D interior scenes using AI. Upload a JPG, PNG, or PDF floor plan and get a fully furnished, textured 3D model you can walk through, edit, and export.

## Features

- **Floor Plan Parsing** -- AI vision models extract room boundaries, walls, doors, and windows from your image
- **Auto Furniture Placement** -- LLM-powered furniture planning that matches your chosen interior style
- **3D Viewer** -- Orbit, walk-through, and edit modes for exploring your scene
- **Scene Inspector** -- Review parse quality scores and debug overlays before finalizing
- **Style Presets** -- Six built-in styles: Modern Luxury, Cream, Nordic, New Chinese, Wabi-Sabi, Industrial
- **AI Rendering** -- Generate photorealistic renders of any room angle using image generation models
- **GLB Export** -- Export your 3D scene as a standard GLB file for use in other tools
- **Multi-Language** -- Full UI support for English and Chinese

![Planova Screenshot](/img/Screenshot_20260508_195100.png)

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop Framework | Tauri v2 | 2.9 |
| Frontend | React | 19 |
| 3D Rendering | Three.js (via React Three Fiber) | 0.184 |
| Styling | Tailwind CSS | v4 |
| State Management | Zustand | 5 |
| Database | SQLite (rusqlite) | -- |
| Async Runtime | Tokio | 1 |
| Build Tool | Vite | 8 |
| Package Manager | pnpm | -- |

## How It Works

Planova uses a multi-stage pipeline to transform your floor plan image into a 3D scene:

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

1. **Image** -- You upload a floor plan (JPG/PNG/PDF)
2. **VLM Parse** -- A Vision Language Model extracts rooms, walls, doors, and windows
3. **Normalize** -- Raw data is converted to a standardized scene graph with real-world dimensions
4. **Repair** -- Geometry issues (gaps, overlaps, misalignments) are automatically fixed
5. **Validate** -- The scene is scored for quality; you review and approve or retry
6. **3D Render** -- Furniture is placed, materials applied, and the walkable scene is generated

:::info Pipeline Modes
Planova supports two pipeline modes: **Hybrid CV+VLM** (default) which combines classical computer vision with VLM for better accuracy, and **Legacy** mode where the VLM handles everything. You can switch between them in Settings.
:::
