---
sidebar_position: 4
title: Inspector Panel
description: Using the right-side inspector panel to view and edit scene data in Planova.
---

# Inspector Panel

The **Inspector Panel** is the right-side panel in the project view. It provides detailed information about the scene and lets you edit every aspect of the generated interior. It has two tabs: **Scenes** and **Inspector**.

## Scenes Tab

The Scenes tab is the entry point for managing scenes within a project.

### Scene List

A scrollable list of all scenes in the project. Each entry shows:

- A **thumbnail preview** of the scene
- The scene name and creation date
- Click a scene to load it in the 3D viewer

### Floor Plan Preview

Below the scene list, a preview of the original uploaded floor plan image is displayed. This helps you reference the 2D layout while working in 3D.

### Project Info

Basic project metadata:

- Project name and description
- Creation date
- Current style preset

### Texture Selector

A visual grid of available textures organized by category (floor, wall, ceiling). Click a texture to preview it or assign it to surfaces via the [Inspector tab](#inspector-tab).

## Inspector Tab

The Inspector tab exposes the full **HomeSceneJSON** data structure that defines the 3D scene. It is organized into collapsible sections.

### Sections

Each section corresponds to a top-level key in the scene JSON:

| Section | Contents |
|---------|----------|
| **Objects** | Furniture and decorative items placed in the scene |
| **Rooms** | Room definitions with dimensions and positions |
| **Walls** | Wall segments with height, thickness, and connected rooms |
| **Openings** | Doors and windows with width, height, and wall references |
| **Materials** | Texture assignments and material properties |
| **Lights** | Light sources (type, position, color, intensity) |
| **Cameras** | Saved camera positions and orientations |

### Collapsible Headers

Each section header is clickable to expand or collapse the section. A **count badge** on the header shows how many items are in that section (e.g., "Objects (12)").

### Visual Cards vs. JSON Editor

Each section offers two viewing modes, toggled by a **JSON switch** at the top of the section:

- **Visual Cards** (default) -- each item is displayed as a card with labeled, editable fields:
  - **Number inputs** for dimensions (width, height, depth)
  - **Vec3 inputs** for position, rotation, and scale (X, Y, Z fields)
  - **Color swatches** for material colors and light colors
  - **Dropdown selects** for enums (light type, material preset, etc.)

- **JSON Editor** -- a raw inline [CodeMirror](https://codemirror.net/) editor showing the JSON for that section. Useful for bulk edits or for fields not yet exposed in the visual cards.

:::info
Switching between visual cards and JSON does not lose your edits. Both views reflect the same underlying data.
:::

### Bidirectional Editing

The Inspector and the 3D Viewer are tightly coupled:

- **Editing in the Inspector** (changing a position value, swapping a color) immediately updates the 3D view.
- **Editing in the 3D view** (moving an object with TransformControls in [Edit mode](./viewer.md#3-edit-mode)) immediately updates the corresponding Inspector fields.

This bidirectional sync means you can use whichever interface is more convenient for a given task.

### Parse Quality Badge

At the top of the Inspector tab, a **parse quality badge** summarizes how well the floor plan was parsed. It includes progress bars for:

- **Room detection** -- percentage of rooms successfully identified
- **Wall accuracy** -- how closely extracted walls match the original plan
- **Opening detection** -- percentage of doors and windows found

Higher scores generally mean a more accurate 3D generation. If scores are low, consider uploading a higher-resolution floor plan image.
