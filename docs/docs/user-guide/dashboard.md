---
sidebar_position: 1
title: Project Dashboard
description: Overview of the Planova project dashboard, managing projects, and understanding project statuses.
---

# Project Dashboard

The **Project Dashboard** is the first screen you see when you open Planova. It lets you browse, create, and manage all your interior design projects from one place.

## Layout

The dashboard displays projects in a **2-column responsive grid**. On wider screens, two project cards sit side by side. On narrower screens the grid collapses to a single column automatically.

Each project card shows:

- **Project name** and a short description
- A **status badge** indicating the current generation state
- A thumbnail or placeholder image
- Action buttons (open, delete)

## Demo Projects

Planova ships with two built-in demo projects so you can explore the full workflow without uploading your own floor plan:

| Project | Description |
|---------|-------------|
| **test_studio** | A compact studio apartment layout. Good for testing single-room generation, furniture placement, and walkthrough navigation in a small space. |
| **test_2br** | A two-bedroom apartment with multiple rooms, hallways, and door openings. Useful for testing multi-room generation, wall connections, and room-to-room transitions. |

:::tip
Open a demo project first to see a fully generated 3D scene before creating your own. This gives you a feel for the viewer controls and inspector panels.
:::

## Creating a New Project

1. Click the **+ New Project** card in the dashboard grid.
2. Fill in the dialog fields:
   - **Name** (required) -- a short, descriptive title for your project.
   - **Description** (optional) -- a few words about the space or design intent.
   - **Style** -- choose one of the [6 style presets](./styles.md) (e.g., Modern Luxury, Nordic). You can change this later.
3. Click **Create**.

The new project appears in the grid immediately with a **pending** status.

## Deleting a Project

1. Click the **delete** (trash) icon on a project card.
2. A **confirmation dialog** appears asking you to confirm.
3. Click **Delete** to permanently remove the project and all its associated files (uploaded floor plans, generated scenes, and exports).

:::warning
Deletion is permanent and cannot be undone. Make sure you have exported anything you want to keep before deleting a project.
:::

## Project Status Badges

Every project card displays a color-coded status badge:

| Badge | Meaning |
|-------|---------|
| **pending** | The project has been created but no floor plan has been uploaded or parsed yet. |
| **generating** | The 3D scene is currently being generated. This usually takes a few seconds to a couple of minutes depending on complexity. |
| **completed** | Generation finished successfully. You can open the project and explore the 3D viewer. |
| **error** | Something went wrong during generation. Open the project to see error details and retry if needed. |

Status updates are reflected in real time -- you do not need to refresh the dashboard manually.
