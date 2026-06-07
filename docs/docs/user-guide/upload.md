---
sidebar_position: 2
title: Uploading Floor Plans
description: How to upload and parse floor plan images in Planova.
---

# Uploading Floor Plans

Once you have created a project, the next step is to upload a floor plan image. Planova uses a vision-language model (VLM) to parse the image and extract room geometry, walls, doors, and other structural elements.

## Supported Formats

| Format | Extension | Max Size |
|--------|-----------|----------|
| JPEG | `.jpg`, `.jpeg` | 50 MB |
| PNG | `.png` | 50 MB |
| PDF | `.pdf` | 50 MB |

:::info
For best results, use a clear, high-resolution top-down floor plan with labeled rooms and visible wall edges. Hand-drawn sketches can work but may produce less accurate results.
:::

## Uploading Files

### Drag and Drop

The upload page features a large **drag-and-drop zone** in the center of the screen.

1. Open a project from the dashboard.
2. Drag one or more floor plan files from your file manager and drop them onto the zone.
3. The zone highlights with a visual border effect while you hover over it.

### Browse Button

If you prefer, click the **Browse Files** button inside the drop zone to open a native file picker dialog.

## File List

After uploading, files appear in a scrollable list below the drop zone. Each entry shows:

- A **thumbnail preview** of the uploaded image
- The **file name** and size
- A **parse status overlay** badge on the thumbnail

## Parse States

Each uploaded file moves through the following states:

```
pending --> parsing --> completed
                   \-> failed
```

| State | Description |
|-------|-------------|
| **pending** | File uploaded, waiting to be parsed. |
| **parsing** | The VLM is currently analyzing the floor plan image. |
| **completed** | Parsing finished. Room geometry has been extracted and is ready for 3D generation. |
| **failed** | Parsing encountered an error. See the error message for details. You can retry. |

## Auto-Parse

If you have configured an LLM API key in [Settings](../getting-started/configuration), parsing starts **automatically** as soon as a file is uploaded. You do not need to click anything.

If no API key is configured, files remain in the **pending** state until you configure one and manually trigger a retry.

## Retrying After Failure

If a file fails to parse:

1. Check the error message shown on the file entry. Common causes include invalid API key, network timeout, or an unreadable image.
2. Fix the underlying issue (e.g., update your API key in Settings).
3. Click the **Retry** button on the failed file entry.

## Status Polling

The upload page automatically polls the backend every **2 seconds** to refresh parse statuses. You will see the status badge update in real time without needing to reload the page.

:::tip
While a file is parsing, you can navigate to other pages and come back -- the status will have updated by the time you return.
:::
