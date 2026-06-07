---
sidebar_position: 3
title: Configuration
description: Configure language, pipeline mode, and AI providers in Planova
keywords: [settings, configuration, API keys, LLM, providers]
---

# Configuration

Planova's Settings page lets you configure language, pipeline behavior, and AI provider connections. Open it from the top navigation bar.

## Language

Planova supports two interface languages:

| Code | Language |
|------|----------|
| `en-US` | English |
| `zh-CN` | Chinese (Simplified) |

Click the language button to switch. The change takes effect immediately across the entire UI.

## Pipeline Mode

Planova offers two pipeline modes for parsing floor plans:

### Hybrid CV+VLM (default)

Uses classical computer vision (edge detection, contour analysis) for wall and room geometry, combined with a Vision Language Model for semantic understanding (room labels, furniture, door/window types). This mode generally produces more accurate wall geometry.

### Legacy

The VLM handles everything -- both geometry extraction and semantic analysis. This mode is simpler but may produce less precise wall positions on complex floor plans.

:::tip When to Use Legacy Mode
Try Legacy mode if the Hybrid mode produces strange geometry for your particular floor plan style. Some hand-drawn or non-standard floor plans work better with the VLM-only approach.
:::

## LLM Provider Configuration

Planova uses three separate AI providers, each serving a different purpose in the pipeline. You configure each one independently.

All three providers share the same configuration fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Base URL** | The API endpoint URL | `https://api.openai.com/v1` |
| **API Key** | Your authentication key | `sk-...` |
| **Model** | The model identifier to use | `gpt-4o` |

Each provider card has a **Test Connection** button that sends a lightweight request to verify your credentials and measure latency.

### VLM Provider (Image Parsing)

This provider runs the Vision Language Model that reads your floor plan image and extracts structural data: rooms, walls, doors, windows, and their positions.

**Requirements:** The model must support image input (multimodal). Examples:
- `gpt-4o` (OpenAI)
- `claude-3.5-sonnet` (Anthropic)
- `qwen-vl-max` (Alibaba)

### Chat Provider (Furniture Planning)

This provider runs the language model that decides what furniture to place in each room, based on the room type, size, and your chosen style preset.

**Requirements:** Any capable chat/completion model. Examples:
- `gpt-4o` (OpenAI)
- `claude-3.5-sonnet` (Anthropic)
- `deepseek-chat` (DeepSeek)

### Image Provider (AI Rendering)

This provider generates photorealistic renders of your 3D scene from a given camera angle and prompt.

**Requirements:** An image generation API. Examples:
- `dall-e-3` (OpenAI)
- A self-hosted Stable Diffusion endpoint

:::warning Separate Providers Are Fine
The three providers do not need to come from the same vendor. You can use OpenAI for VLM, DeepSeek for chat, and a local Stable Diffusion instance for rendering -- whatever gives you the best results and cost for each task.
:::

### Testing Your Connection

For each provider, click **Test Connection** after filling in the Base URL, API Key, and Model fields. The test will:

- Validate that the endpoint is reachable
- Verify your API key is accepted
- Confirm the model exists
- Report the round-trip latency in milliseconds

A green checkmark with latency (e.g. "Connection successful (342ms)") means everything is working. A red indicator with an error message will guide you toward the issue.

## Data Storage Location

Planova stores all data in the platform-specific application data directory:

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/com.planova.app/` |
| macOS | `~/Library/Application Support/com.planova.app/` |
| Windows | `C:\Users\<you>\AppData\Roaming\com.planova.app\` |

This directory contains:

- `planova.db` -- SQLite database with projects, files, and settings
- `uploads/` -- original uploaded floor plan images
- `previews/` -- generated preview images
- `pipeline/` -- intermediate pipeline artifacts (per project)

:::tip Backing Up Your Data
To back up all your projects, copy the entire `com.planova.app` directory. The SQLite database is self-contained and portable.
:::

## Saving Settings

After making changes, click the **Save** button at the top of the Settings page. Settings are persisted to the SQLite database and take effect immediately.

:::info Settings Are Per-Installation
All settings (including API keys) are stored locally on your machine. They are never sent to any external service except the AI providers you explicitly configure.
:::
