---
sidebar_position: 5
title: Style Presets
description: Available interior design style presets and texture customization in Planova.
---

# Style Presets

Planova includes **6 interior design style presets** that control the look and feel of generated rooms. Each preset defines a curated set of textures, materials, and default furniture aesthetics.

## Available Styles

### Modern Luxury

Marble surfaces, gold metallic accents, and sleek contemporary furniture. Think polished floors, dark veined stone countertops, and brass fixtures. A high-end, cosmopolitan look.

### Cream

Soft neutral tones with rounded furniture silhouettes and plush textures. Warm whites, beige linens, and curved sofas create a cozy, inviting atmosphere. Works well in living rooms and bedrooms.

### Nordic

Light wood floors, white walls, and minimal furniture. Inspired by Scandinavian design -- clean lines, functional forms, and a bright, airy palette. Emphasizes simplicity and natural light.

### New Chinese

Dark wood lattice screens, ink painting motifs, and a blend of traditional and modern elements. Rich walnut tones paired with subtle calligraphy-inspired decor. A refined, culturally rooted aesthetic.

### Wabi-Sabi

Raw concrete walls, imperfect hand-thrown ceramics, and earthy muted tones. Celebrates imperfection and natural aging -- weathered wood, rough plaster, and organic shapes. Calm and understated.

### Industrial

Exposed brick, steel beams, and Edison bulb lighting. Hard surfaces, metal pipe shelving, and reclaimed wood. An urban loft feel with visible structural elements.

## Selecting a Style

When you [create a new project](./dashboard.md#creating-a-new-project), a **Style Selection Dialog** appears with all 6 presets arranged in a **3-column grid**. Each cell shows:

- A preview thumbnail
- The style name
- A one-line description

Click a style to select it, then confirm. You can change the style later from the [Scenes tab](./inspector.md#scenes-tab) in the Inspector panel.

## Texture Customization

After selecting a style, you can fine-tune individual textures from the **Texture Customization Panel** in the Scenes tab.

### Categories

Textures are organized by surface category:

| Category | Applies to |
|----------|------------|
| **Floor** | Room floors, ground surfaces |
| **Wall** | Interior and exterior wall surfaces |
| **Ceiling** | Ceiling planes |

### Texture Browser

Each category displays a **horizontally scrollable** strip of texture thumbnails. Scroll left and right to browse all available options for that category.

- Click a texture to preview it in the 3D view.
- The selected texture is highlighted with a border.

### Material Properties

Each texture carries material properties that control how it renders under lighting:

| Property | Type | Description |
|----------|------|-------------|
| `base_color` | Color (hex) | The primary color tint applied to the texture |
| `roughness` | Number (0.0 -- 1.0) | How rough or smooth the surface appears. 0 = mirror-shiny, 1 = fully matte |
| `metalness` | Number (0.0 -- 1.0) | How metallic the surface looks. 0 = dielectric (plastic, wood), 1 = metal |

You can adjust these values in the [Inspector tab](./inspector.md#visual-cards-vs-json-editor) under the **Materials** section to get the exact look you want.

:::tip
For marble floors, try `roughness: 0.15` and `metalness: 0.05` for a polished stone effect. For raw concrete (Wabi-Sabi), try `roughness: 0.85` and `metalness: 0.0`.
:::
