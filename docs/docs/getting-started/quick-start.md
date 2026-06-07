---
sidebar_position: 2
title: Quick Start
description: Walk through the full Planova workflow from launch to export
keywords: [tutorial, workflow, quick start, guide]
---

# Quick Start

This guide walks you through the full Planova workflow: uploading a floor plan, reviewing the AI parse, exploring the 3D scene, and exporting the result.

## 1. Launch the App

Start Planova in development mode:

```bash
pnpm tauri dev
```

The app opens to the **Project Dashboard**.

## 2. Create a New Project

Click the **New Project** button on the dashboard. You will be prompted to fill in:

- **Name** -- a descriptive name for your project (e.g. "Apartment 3BR")
- **Description** -- optional notes
- **Style** -- choose one of the six interior styles:
  - Modern Luxury
  - Cream
  - Nordic
  - New Chinese
  - Wabi-Sabi
  - Industrial

Click **Create** to proceed. You will be taken to the project detail page.

:::tip Style Can Be Changed Later
You can change the style preset at any time from the 3D viewer toolbar. Each style applies different materials, colors, and furniture sets.
:::

## 3. Upload a Floor Plan Image

On the project detail page, click the upload area or drag and drop a floor plan file.

**Supported formats:**
- JPG / JPEG
- PNG
- PDF

Maximum file size is 50 MB.

:::info Best Results
For the most accurate parsing, use a clean, high-resolution floor plan with clearly visible room labels, wall lines, and door/window symbols. Hand-drawn sketches can work but may produce lower quality results.
:::

## 4. Wait for AI Parsing

Once uploaded, Planova automatically begins the parsing pipeline. You will see progress indicators for each stage:

1. **Preprocessing** -- image is cleaned and normalized
2. **VLM Parse** -- the AI vision model analyzes the floor plan
3. **Normalize** -- raw detections are converted to a scene graph
4. **Repair** -- geometry issues are fixed
5. **Validate** -- the scene is scored for quality
6. **3D Generation** -- furniture is placed and materials applied

The entire process typically takes 30--90 seconds depending on your LLM provider and the complexity of the floor plan.

## 5. Review Parse Quality

After parsing completes, you will see the **ReviewGate** screen. This shows:

- **Quality scores** -- metrics like wall completeness, room closure, and furniture coverage, each displayed as a percentage
- **Debug overlay** -- a rendered image showing detected walls, rooms, doors, and windows overlaid on your original floor plan
- **Scene preview** -- a quick look at the generated 3D scene

You have two options:

| Action | When to Use |
|--------|-------------|
| **Accept** | Quality scores look good, proceed to the 3D viewer |
| **Retry** | Scores are low or the parse missed rooms; re-run the pipeline |

:::warning Low Quality Scores
If wall completeness or room closure is below 70%, consider retrying or uploading a cleaner floor plan image. Low scores mean the 3D geometry will have gaps or incorrect room shapes.
:::

## 6. Explore the 3D Scene

Once you accept the parse, you enter the **3D Viewer**. There are three interaction modes:

### Orbit Mode (default)
- **Left-click drag** to rotate the camera around the scene
- **Scroll wheel** to zoom in/out
- **Right-click drag** to pan
- **Reset Camera** button to return to the default view

### Walk Mode
- Click **Walk** in the toolbar to enter first-person mode
- **WASD** or **Arrow keys** to move
- **Mouse** to look around
- Press **Esc** to exit walk mode

### Edit Mode
- Click **Edit** in the toolbar
- **Click on any object** (furniture, wall, etc.) to select it
- Use the controls to **move**, **rotate**, or **delete** selected objects
- Toggle **ceilings** on/off for a better view during editing

## 7. Change Style Preset

In the viewer toolbar, click the style selector to switch between presets. Each preset changes:

- Wall and floor materials/textures
- Ceiling style
- Furniture models and colors
- Lighting mood

The scene regenerates with the new style while preserving the room layout.

## 8. Export or Render

From the 3D viewer toolbar you have two export options:

### Export as GLB

Click **Export GLB** to save the 3D scene as a standard `.glb` file. This file can be imported into:

- Blender
- Unity
- Unreal Engine
- Any 3D tool that supports the GLB/GLTF format

### AI Render

Click **AI Render** to generate a photorealistic image of the current view:

1. Optionally edit the rendering prompt to describe the mood or lighting you want
2. Click **Generate**
3. Wait for the image generation model to produce the render
4. The rendered image is saved to your project

:::info AI Rendering Requires Configuration
AI rendering uses a separate image generation provider. Make sure you have configured the **Image provider** in Settings with a compatible model (e.g. DALL-E, Stable Diffusion).
:::
