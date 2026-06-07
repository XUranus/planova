---
sidebar_position: 6
title: Exporting & Rendering
description: How to export 3D scenes, take screenshots, and generate AI renders in Planova.
---

# Exporting & Rendering

Planova provides several ways to get your 3D scene out of the app -- as a standard 3D file, a screenshot, or a photorealistic AI render.

## GLB Export

Export the full generated scene as a `.glb` file, the binary format of [glTF](https://www.khronos.org/gltf/) -- the standard for 3D on the web.

### How to Export

1. Click the **Export GLB** button in the [viewer toolbar](./viewer.md#toolbar).
2. A native **save dialog** appears. Choose a destination folder and file name.
3. Click **Save**. The file is written and then automatically opened with your system's default 3D viewer (if one is associated with `.glb` files).

### What's Included

The exported `.glb` file contains:

- All room geometry (floors, walls, ceilings)
- Placed furniture and objects with their transforms
- Materials and textures (embedded in the file)
- Lights

:::tip
GLB files can be imported into Blender, Unity, Unreal Engine, or any glTF-compatible tool for further editing or rendering.
:::

### Technical Details

Planova uses Three.js's [GLTFExporter](https://threejs.org/docs/#examples/en/exporters/GLTFExporter) to serialize the scene. The export runs entirely client-side in the Tauri WebView -- no data is sent to a server.

## Screenshot

Capture the current view of the 3D canvas as a static image.

### How to Take a Screenshot

1. Position the camera to frame the shot you want. Use [Orbit mode](./viewer.md#1-orbit-mode-default) for the most control.
2. Click the **Screenshot** button in the toolbar.
3. A native **save dialog** appears. Choose a destination and file name.
4. The image is saved as a **PNG** file and opened with your system's default image viewer.

### Tips for Good Screenshots

- Toggle ceilings off (`C` key) for a clear interior view from above.
- Use Orbit mode to get a 3/4 perspective angle.
- The screenshot captures exactly what you see in the canvas, including any UI overlays that are part of the WebGL render (but not the HTML toolbar).

## AI Render

AI Render sends your current view to a backend service that generates a **photorealistic image** based on the scene and a style prompt. This is useful for creating client-facing presentations or mood boards.

### How to Use AI Render

1. Frame the view you want to render in the 3D viewer.
2. Click the **AI Render** button in the toolbar.
3. A dialog appears with a **prompt field** pre-filled with a default prompt for the current style.
4. Optionally edit the prompt to change the rendering style, lighting, or mood.
5. Click **Render**. The screenshot and prompt are sent to the backend.
6. When the result returns, it automatically **opens with your system's default image viewer**.

### Default Prompts per Style

Each style preset includes a default render prompt that describes the desired aesthetic:

| Style | Default Prompt (abbreviated) |
|-------|------------------------------|
| Modern Luxury | "Photorealistic luxury interior, marble floors, gold accents, soft natural lighting" |
| Cream | "Warm cozy interior, cream tones, plush furniture, diffused daylight" |
| Nordic | "Scandinavian interior, light wood, white walls, minimal decor, bright airy feel" |
| New Chinese | "Modern Chinese interior, dark wood, lattice screens, ink painting accents, warm tones" |
| Wabi-Sabi | "Wabi-sabi interior, raw concrete, imperfect ceramics, earthy muted tones, soft shadows" |
| Industrial | "Industrial loft interior, exposed brick, steel beams, Edison bulbs, urban atmosphere" |

### Custom Prompts

You can write any prompt you like. Some ideas:

- Change the time of day: *"nighttime scene with warm lamp light"*
- Emphasize a mood: *"serene minimalist bedroom, morning golden hour"*
- Specify a camera angle: *"wide-angle shot from doorway looking in"*

:::info
AI Render requires a configured backend with image generation capabilities. If the render button is disabled, check your [Settings](../getting-started/configuration) for the correct API configuration.
:::

## Export Workflow Summary

All three export options follow the same pattern:

1. **Click** the button in the toolbar.
2. **Choose** a save location in the native dialog (or enter a prompt for AI Render).
3. **File saved** to disk and **automatically opened** with the system default viewer.

No extra steps are needed -- Planova handles serialization, file I/O, and launching the external viewer for you.
