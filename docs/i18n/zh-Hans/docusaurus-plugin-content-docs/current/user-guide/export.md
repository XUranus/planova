---
sidebar_position: 6
title: 导出与渲染
description: 如何在 Planova 中导出 3D 场景、截图和生成 AI 渲染。
---

# 导出与渲染

Planova 提供多种方式将 3D 场景从应用中导出——标准 3D 文件、截图或照片级 AI 渲染。

## GLB 导出

将完整的生成场景导出为 `.glb` 文件，即 [glTF](https://www.khronos.org/gltf/) 的二进制格式——Web 端 3D 的行业标准。

### 如何导出

1. 点击 [查看器工具栏](./viewer.md#工具栏) 中的 **导出 GLB** 按钮。
2. 弹出系统原生 **保存对话框**，选择目标文件夹和文件名。
3. 点击 **保存**。文件写入后会自动使用系统默认的 3D 查看器打开（如果有关联 `.glb` 文件的应用）。

### 包含内容

导出的 `.glb` 文件包含：

- 所有房间几何体（地板、墙面、天花板）
- 已放置的家具和物体及其变换信息
- 材质和纹理（嵌入文件中）
- 灯光

:::tip
GLB 文件可导入 Blender、Unity、Unreal Engine 或任何兼容 glTF 的工具中进行进一步编辑或渲染。
:::

### 技术细节

Planova 使用 Three.js 的 [GLTFExporter](https://threejs.org/docs/#examples/en/exporters/GLTFExporter) 来序列化场景。导出过程完全在 Tauri WebView 的客户端侧运行——不会向服务器发送任何数据。

## 截图

将 3D 画布的当前视角捕获为静态图片。

### 如何截图

1. 将相机移动到你想要的构图位置。使用 [轨道模式](./viewer.md#1-轨道模式默认) 可获得最佳控制效果。
2. 点击工具栏中的 **截图** 按钮。
3. 弹出系统原生 **保存对话框**，选择保存位置和文件名。
4. 图片保存为 **PNG** 文件，并使用系统默认的图片查看器打开。

### 截图技巧

- 关闭天花板（按 `C` 键）可获得清晰的上方俯视内部视角。
- 使用轨道模式可获得 3/4 透视角度。
- 截图捕获的是画布中你所看到的内容，包括 WebGL 渲染中的 UI 叠加层（但不包括 HTML 工具栏）。

## AI 渲染

AI 渲染将当前视角发送到后端服务，根据场景和风格提示词生成 **照片级真实感图片**。适合制作面向客户的演示文稿或灵感板。

### 如何使用 AI 渲染

1. 在 3D 查看器中调整好要渲染的视角。
2. 点击工具栏中的 **AI 渲染** 按钮。
3. 弹出对话框，**提示词输入框** 中预填了当前风格的默认提示词。
4. 可选：编辑提示词以更改渲染风格、光照或氛围。
5. 点击 **渲染**。截图和提示词将发送到后端。
6. 结果返回后，会自动使用系统默认的图片查看器打开。

### 各风格的默认提示词

每种风格预设都包含描述目标美学的默认渲染提示词：

| 风格 | 默认提示词（节选） |
|-------|------------------------------|
| 现代奢华 | "Photorealistic luxury interior, marble floors, gold accents, soft natural lighting" |
| 奶油风格 | "Warm cozy interior, cream tones, plush furniture, diffused daylight" |
| 北欧 | "Scandinavian interior, light wood, white walls, minimal decor, bright airy feel" |
| 新中式 | "Modern Chinese interior, dark wood, lattice screens, ink painting accents, warm tones" |
| 侘寂 | "Wabi-sabi interior, raw concrete, imperfect ceramics, earthy muted tones, soft shadows" |
| 工业风 | "Industrial loft interior, exposed brick, steel beams, Edison bulbs, urban atmosphere" |

### 自定义提示词

你可以编写任何你喜欢的提示词。一些参考思路：

- 更改时间：*"nighttime scene with warm lamp light"*
- 强调氛围：*"serene minimalist bedroom, morning golden hour"*
- 指定镜头角度：*"wide-angle shot from doorway looking in"*

:::info
AI 渲染需要配置具有图像生成能力的后端服务。如果渲染按钮不可用，请检查 [设置](../getting-started/configuration) 中的 API 配置是否正确。
:::

## 导出工作流程总结

三种导出方式遵循相同的流程：

1. **点击** 工具栏中的按钮。
2. 在原生对话框中 **选择** 保存位置（或为 AI 渲染输入提示词）。
3. 文件 **保存** 到磁盘，并自动使用系统默认查看器打开。

无需额外步骤——Planova 会为你处理序列化、文件 I/O 和启动外部查看器。
