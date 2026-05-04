下面是一版可以直接作为后续开发蓝本的 proposal。定位是：**Tauri + Three.js 客户端，AI 从户型图生成可漫游 3D 室内模型**。

---

# Proposal：AI 户型图生成可漫游 3D 模型工具

## 1. 项目概述

本项目旨在开发一款桌面端 AI 室内空间生成工具。用户上传户型图、建筑平面图、PDF 图纸或手绘草图后，系统自动识别房间结构、墙体、门窗、空间关系，并生成一个可在客户端中自由漫游、切换视角、编辑材质和家具布局的 3D 室内模型。

前端采用 **Tauri + React + Three.js / React Three Fiber** 构建桌面应用，后端负责图纸解析、AI 推理、3D 场景生成、资产管理和任务调度。

项目初期不追求专业 BIM/CAD 级精度，而是优先实现：

```text
上传户型图 → 自动生成 3D 白模 → 自动布置基础家具 → 应用装修风格 → 用户自由漫游 → 导出 GLB / 效果图
```

---

## 2. 产品定位

### 2.1 目标用户

主要面向以下用户：

```text
装修前期用户
室内设计师
家装公司
房产中介
开发商营销团队
家居内容创作者
```

### 2.2 核心价值

传统 AI 室内设计工具大多只能生成 2D 效果图，用户无法自由调整视角，也无法继续编辑空间结构。本项目希望提供一个更高维度的能力：

```text
从平面图生成真实可交互的 3D 空间
```

用户不仅能看到几张效果图，还可以像游戏一样进入房间内查看空间。

### 2.3 产品一句话

> 一款 AI 驱动的户型图转 3D 室内空间工具，让用户上传平面图后自动生成可漫游、可编辑、可导出的 3D 家装模型。

---

## 3. 项目目标

## 3.1 MVP 目标

第一阶段 MVP 应实现以下能力：

```text
1. 支持上传 JPG / PNG / PDF 户型图
2. AI 自动识别房间、墙体、门窗和空间关系
3. 生成基础 3D 白模
4. 支持 Three.js 中自由旋转、缩放和第一人称漫游
5. 支持基础家具自动摆放
6. 支持 2~3 种装修风格材质模板
7. 支持从当前视角导出图片
8. 支持导出 GLB / glTF 模型
9. 支持任务历史和项目管理
```

## 3.2 中期目标

```text
1. 支持用户手动修正户型解析结果
2. 支持拖拽家具、替换家具、修改材质
3. 支持多房间自动设计
4. 支持风格切换
5. 支持自动生成多视角效果图
6. 支持局部重生成，例如只重做客厅、卧室、厨房
7. 支持资产库检索与推荐
```

## 3.3 长期目标

```text
1. 支持 DXF / CAD 文件导入
2. 支持更高精度的户型结构识别
3. 支持生成装修清单和预算
4. 支持导出到 Blender / Unity / Unreal / SketchUp
5. 支持多人协作和云端项目同步
6. 支持 AI 室内设计 Agent
7. 支持从 3D 场景自动生成宣传效果图和漫游视频
```

---

# 4. 核心产品流程

## 4.1 用户侧流程

```text
创建项目
    ↓
上传户型图 / PDF / 手绘草图
    ↓
选择户型输入类型
    ↓
输入补充需求
    ↓
选择装修风格
    ↓
点击生成
    ↓
系统解析户型图
    ↓
系统生成 3D 白模
    ↓
系统自动布置基础家具
    ↓
系统应用材质与灯光
    ↓
用户进入 3D Viewer 漫游
    ↓
用户编辑 / 导出 / 重新生成
```

## 4.2 系统内部流程

```text
Input File
    ↓
Image Preprocess
    ↓
Floor Plan Parser
    ↓
Home Scene JSON
    ↓
Geometry Generator
    ↓
Furniture Layout Planner
    ↓
Asset Matcher
    ↓
Material & Lighting Engine
    ↓
glTF / GLB Scene Builder
    ↓
Three.js Viewer
```

---

# 5. 系统架构设计

## 5.1 总体架构

```text
┌────────────────────────────────────┐
│        Tauri Desktop Client         │
│ React + Three.js + Zustand          │
└────────────────────────────────────┘
                  │
                  │ HTTP / WebSocket
                  ↓
┌────────────────────────────────────┐
│              Backend API            │
│ FastAPI / Node.js                   │
└────────────────────────────────────┘
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
┌──────────┐ ┌──────────┐ ┌─────────────┐
│ File     │ │ Task     │ │ Project     │
│ Service  │ │ Service  │ │ Service     │
└──────────┘ └──────────┘ └─────────────┘
       ↓          ↓
┌────────────────────────────────────┐
│        AI / Geometry Pipeline       │
│ VLM + LLM + Geometry Engine         │
└────────────────────────────────────┘
       ↓
┌────────────────────────────────────┐
│        Asset & Scene Service        │
│ GLB Assets / Materials / Metadata   │
└────────────────────────────────────┘
       ↓
┌────────────────────────────────────┐
│        Storage Layer                │
│ PostgreSQL + Redis + MinIO          │
└────────────────────────────────────┘
```

---

# 6. 技术选型

## 6.1 客户端

推荐技术栈：

```text
Tauri
React
TypeScript
Vite
Three.js
React Three Fiber
Drei
Zustand
TanStack Query
Tailwind CSS
shadcn/ui
```

### 选择 Tauri 的原因

```text
1. 应用体积小
2. 性能好
3. 跨 Windows / macOS / Linux
4. 能访问本地文件系统
5. 适合做桌面生产力工具
6. 前端技术栈复用 Web 生态
```

### Three.js 的作用

```text
1. 加载 glTF / GLB 模型
2. 渲染室内空间
3. 实现 Orbit 控制
4. 实现第一人称漫游
5. 实现家具选择、拖拽、变换
6. 实现材质替换
7. 实现截图导出
```

---

## 6.2 后端

推荐技术栈：

```text
FastAPI
Python
PostgreSQL
Redis
Celery / RQ
MinIO / S3
Pydantic
SQLAlchemy
```

### 使用 Python 后端的原因

```text
1. AI 模型生态成熟
2. 图像处理库丰富
3. 几何处理库较多
4. 与 ComfyUI / Blender / OpenCV 集成方便
```

可选库：

```text
OpenCV
Pillow
Shapely
Trimesh
pygltflib
ezdxf
numpy
scikit-image
```

---

## 6.3 AI 模型层

MVP 阶段可以使用 API 或本地模型混合。

### 视觉理解模型

用于解析户型图内容：

```text
GPT-4.1 / GPT-4o Vision
Gemini Vision
Qwen2.5-VL
InternVL
MiniCPM-V
```

如果需要内网部署，可以优先考虑：

```text
Qwen2.5-VL-7B / 32B
InternVL2.5
MiniCPM-V
```

### LLM Planner

用于生成空间规划和设计方案：

```text
Qwen3
DeepSeek
GPT-4.1
Claude
Llama
```

### 图像生成模型，非主路径

本项目的主路径不是直接生成 2D 图像，但后续可以用图像模型生成宣传图：

```text
FLUX
SDXL
ControlNet
ComfyUI
```

---

# 7. 核心数据结构：Home Scene JSON

整个系统最重要的是定义一个中间数据格式，建议叫做：

```text
Home Scene JSON
```

它是户型图解析、AI 规划、3D 生成、前端渲染、导出功能之间的统一协议。

## 7.1 顶层结构

```json
{
  "schema_version": "0.1.0",
  "project": {
    "id": "project_001",
    "name": "Modern Apartment",
    "unit": "meter"
  },
  "global": {
    "style": "modern_luxury",
    "ceiling_height": 2.8,
    "wall_thickness": 0.2
  },
  "rooms": [],
  "walls": [],
  "openings": [],
  "objects": [],
  "materials": [],
  "lights": [],
  "cameras": []
}
```

---

## 7.2 房间结构

```json
{
  "id": "room_living_001",
  "type": "living_room",
  "name": "Living Room",
  "polygon": [
    [0, 0],
    [5.2, 0],
    [5.2, 4.1],
    [0, 4.1]
  ],
  "area": 21.32,
  "floor_material": "mat_wood_floor_001",
  "wall_material": "mat_wall_warm_gray",
  "ceiling_material": "mat_ceiling_white"
}
```

---

## 7.3 墙体结构

```json
{
  "id": "wall_001",
  "start": [0, 0],
  "end": [5.2, 0],
  "height": 2.8,
  "thickness": 0.2,
  "material": "mat_wall_warm_gray",
  "room_refs": ["room_living_001"]
}
```

---

## 7.4 门窗洞口

```json
{
  "id": "opening_001",
  "type": "door",
  "wall_ref": "wall_001",
  "position": [1.2, 0],
  "width": 0.9,
  "height": 2.1,
  "sill_height": 0,
  "swing": "left_inward"
}
```

窗户：

```json
{
  "id": "opening_002",
  "type": "window",
  "wall_ref": "wall_002",
  "position": [4.2, 0],
  "width": 1.8,
  "height": 1.4,
  "sill_height": 0.9
}
```

---

## 7.5 家具对象

```json
{
  "id": "obj_sofa_001",
  "type": "furniture",
  "category": "sofa",
  "asset_id": "asset_sofa_modern_023",
  "room_ref": "room_living_001",
  "position": [2.5, 0, 1.2],
  "rotation": [0, 1.57, 0],
  "scale": [1, 1, 1],
  "size": [2.8, 0.9, 0.8],
  "material_overrides": {}
}
```

---

## 7.6 材质结构

```json
{
  "id": "mat_wood_floor_001",
  "type": "pbr",
  "name": "Dark Walnut Wood Floor",
  "base_color": "#6B4B35",
  "roughness": 0.55,
  "metalness": 0.0,
  "texture_urls": {
    "base_color": "/materials/wood_dark/basecolor.jpg",
    "normal": "/materials/wood_dark/normal.jpg",
    "roughness": "/materials/wood_dark/roughness.jpg"
  }
}
```

---

## 7.7 灯光结构

```json
{
  "id": "light_001",
  "type": "area",
  "name": "Living Room Softbox",
  "position": [2.5, 2.6, 2.3],
  "rotation": [0, 0, 0],
  "intensity": 500,
  "color": "#fff4e6",
  "size": [3.0, 2.0]
}
```

---

## 7.8 相机预设

```json
{
  "id": "camera_living_entry",
  "name": "Living Room Entrance View",
  "type": "perspective",
  "position": [1.0, 1.6, 0.8],
  "target": [4.2, 1.4, 3.0],
  "fov": 65
}
```

---

# 8. 核心模块设计

## 8.1 Tauri 客户端模块

客户端建议拆分为以下模块：

```text
Project Dashboard
Upload Workspace
Generation Task Panel
3D Viewer
Scene Editor
Asset Browser
Material Panel
Export Panel
Settings
```

---

## 8.2 3D Viewer

3D Viewer 是客户端核心模块。

### 功能

```text
1. 加载 GLB / glTF 场景
2. Orbit 观察模式
3. 第一人称漫游模式
4. 房间列表导航
5. 预设相机位切换
6. 对象点击选择
7. 家具拖动
8. 材质替换
9. 灯光开关
10. 截图导出
```

### 推荐组件结构

```text
src/
  components/
    viewer/
      SceneViewer.tsx
      SceneCanvas.tsx
      OrbitMode.tsx
      WalkMode.tsx
      CameraPresets.tsx
      ObjectSelector.tsx
      TransformControls.tsx
      MaterialEditor.tsx
      ScreenshotButton.tsx
```

### 状态管理

用 Zustand 管理场景状态：

```ts
type ViewerMode = "orbit" | "walk" | "edit";

interface SceneState {
  projectId: string | null;
  sceneUrl: string | null;
  mode: ViewerMode;
  selectedObjectId: string | null;
  currentCameraId: string | null;
  setMode: (mode: ViewerMode) => void;
  selectObject: (id: string | null) => void;
}
```

---

## 8.3 户型图上传模块

### 支持格式

```text
JPG
PNG
PDF
后续支持 DXF / DWG
```

### 上传流程

```text
用户选择文件
    ↓
本地预览
    ↓
上传到后端
    ↓
后端保存原始文件
    ↓
PDF 转图片
    ↓
创建解析任务
```

---

## 8.4 任务系统

生成 3D 场景不是同步操作，需要任务队列。

### 任务类型

```text
floorplan_parse
scene_generate
furniture_layout
style_apply
glb_export
preview_render
```

### 任务状态

```text
pending
running
waiting_user_review
completed
failed
cancelled
```

### API 示例

```http
POST /api/projects
POST /api/projects/{project_id}/files
POST /api/tasks/generate-scene
GET  /api/tasks/{task_id}
GET  /api/projects/{project_id}/scene
POST /api/projects/{project_id}/scene/regenerate
```

---

# 9. AI Pipeline 设计

## 9.1 Pipeline 总览

```text
Step 1: 输入预处理
Step 2: 户型图解析
Step 3: 生成 Home Scene JSON
Step 4: 用户确认 / 自动修正
Step 5: 生成 3D 几何
Step 6: 家具布局规划
Step 7: 资产匹配
Step 8: 材质和灯光应用
Step 9: 导出 GLB
Step 10: 客户端加载
```

---

## 9.2 Step 1：输入预处理

处理内容：

```text
1. 图片压缩
2. 旋转校正
3. 黑白化
4. 去噪
5. PDF 转图片
6. 多页 PDF 选择主图
7. 户型图边界裁剪
```

可用技术：

```text
OpenCV
Pillow
pdf2image
```

---

## 9.3 Step 2：户型图解析

MVP 阶段建议走混合路线：

```text
传统 CV 初步提取几何
+
视觉大模型辅助理解
+
LLM 输出结构化 JSON
```

### 需要识别的信息

```text
墙体
门
窗
房间轮廓
房间名称
阳台
厨房
卫生间
客厅
卧室
走廊
比例尺 / 尺寸标注
```

### 输出

```json
{
  "detected_rooms": [
    {
      "type": "living_room",
      "polygon": [[0, 0], [5, 0], [5, 4], [0, 4]],
      "confidence": 0.82
    }
  ],
  "detected_walls": [],
  "detected_doors": [],
  "detected_windows": [],
  "warnings": [
    "Scale not detected, using default scale."
  ]
}
```

---

## 9.4 Step 3：Home Scene JSON 生成

这一阶段把解析结果规范化：

```text
1. 坐标统一
2. 单位换算
3. 墙体闭合
4. 房间 polygon 修正
5. 门窗绑定到墙体
6. 生成默认层高
7. 生成默认材质
8. 生成默认相机位
```

---

## 9.5 Step 4：3D 几何生成

从 Home Scene JSON 生成 3D 模型。

### 需要生成

```text
地面 mesh
墙体 mesh
天花板 mesh
门洞
窗洞
门模型
窗模型
踢脚线
简单吊顶
```

MVP 可以先做：

```text
墙体拉伸
地面平面
天花板平面
门窗简单占位
```

高级版再做布尔裁剪、真实门窗和吊顶。

---

## 9.6 Step 5：家具布局规划

### 基础规则

客厅：

```text
沙发靠长墙
电视柜与沙发相对
茶几放沙发前
地毯覆盖沙发与茶几区域
主通道宽度 >= 0.8m
```

卧室：

```text
床头靠墙
床两侧尽量保留通道
衣柜靠墙
床不直接挡门
```

餐厅：

```text
餐桌靠近厨房
餐椅四周保留移动空间
餐边柜靠墙
```

厨房：

```text
橱柜沿墙布置
水槽靠近窗户优先
冰箱靠近入口
遵循洗-切-炒动线
```

卫生间：

```text
洗手台靠近入口
马桶靠墙
淋浴区靠角落
干湿分区优先
```

### LLM Planner 的职责

LLM 不直接生成几何，而是输出布置方案：

```json
{
  "room_id": "room_living_001",
  "layout_strategy": "Place the sofa against the west wall, TV cabinet on the east wall.",
  "furniture": [
    {
      "category": "sofa",
      "preferred_style": "modern_luxury",
      "size": "large",
      "placement": {
        "anchor": "west_wall",
        "offset": 0.4,
        "facing": "east"
      }
    }
  ]
}
```

然后由规则引擎把它转换为精确坐标。

---

## 9.7 Step 6：资产匹配

资产库需要为每个 GLB 模型建立 metadata。

```json
{
  "asset_id": "sofa_023",
  "category": "sofa",
  "style_tags": ["modern", "luxury"],
  "size": [2.8, 0.9, 0.8],
  "colors": ["brown", "black"],
  "materials": ["leather", "metal"],
  "file_url": "/assets/sofa_023.glb",
  "license": "commercial"
}
```

匹配逻辑：

```text
房间类型
家具类别
风格
尺寸
颜色
预算
用户偏好
```

---

## 9.8 Step 7：材质与灯光

MVP 建议先做风格模板。

### 现代轻奢模板

```json
{
  "style": "modern_luxury",
  "floor": "dark_wood",
  "wall": "warm_gray_paint",
  "ceiling": "white",
  "accent": "brushed_gold",
  "lighting": "warm_indirect"
}
```

### 奶油风模板

```json
{
  "style": "cream",
  "floor": "light_oak",
  "wall": "cream_white",
  "ceiling": "matte_white",
  "accent": "soft_beige",
  "lighting": "soft_warm"
}
```

---

# 10. 客户端交互设计

## 10.1 主界面布局

建议采用三栏布局：

```text
左侧：项目 / 上传 / 参数面板
中间：3D Viewer
右侧：对象属性 / 材质 / 家具库
底部：任务进度 / 日志 / 缩略图
```

---

## 10.2 生成界面

左侧参数：

```text
输入类型：
- 户型图
- 手绘草图
- PDF 图纸
- CAD 图纸，后续

风格：
- 现代轻奢
- 奶油风
- 北欧
- 新中式
- 侘寂
- 工业风

生成范围：
- 全屋
- 客厅
- 卧室
- 厨房
- 卫生间

输出：
- 3D 白模
- 家具布置
- 完整装修效果
```

---

## 10.3 Viewer 模式

### Orbit 模式

适合整体查看：

```text
左键旋转
右键平移
滚轮缩放
双击聚焦房间
```

### Walk 模式

适合沉浸式查看：

```text
WASD 移动
鼠标控制视角
Shift 加速
Space 退出漫游
```

### Edit 模式

适合编辑：

```text
点击选择家具
拖拽移动
旋转物体
替换材质
删除对象
添加家具
```

---

# 11. 数据库设计

## 11.1 projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  style TEXT,
  status TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 11.2 uploaded_files

```sql
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  file_type TEXT,
  original_filename TEXT,
  storage_url TEXT,
  preview_url TEXT,
  created_at TIMESTAMP
);
```

## 11.3 generation_tasks

```sql
CREATE TABLE generation_tasks (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  task_type TEXT,
  status TEXT,
  progress INT,
  input JSONB,
  output JSONB,
  error_message TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 11.4 scenes

```sql
CREATE TABLE scenes (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  schema_version TEXT,
  scene_json JSONB,
  glb_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 11.5 assets

```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY,
  category TEXT,
  name TEXT,
  style_tags TEXT[],
  color_tags TEXT[],
  material_tags TEXT[],
  size JSONB,
  glb_url TEXT,
  preview_url TEXT,
  license TEXT,
  created_at TIMESTAMP
);
```

## 11.6 materials

```sql
CREATE TABLE materials (
  id UUID PRIMARY KEY,
  name TEXT,
  category TEXT,
  style_tags TEXT[],
  pbr_config JSONB,
  texture_urls JSONB,
  created_at TIMESTAMP
);
```

---

# 12. API 设计

## 12.1 项目 API

```http
POST /api/projects
GET /api/projects
GET /api/projects/{project_id}
PATCH /api/projects/{project_id}
DELETE /api/projects/{project_id}
```

---

## 12.2 文件 API

```http
POST /api/projects/{project_id}/files
GET /api/projects/{project_id}/files
DELETE /api/files/{file_id}
```

---

## 12.3 生成任务 API

```http
POST /api/projects/{project_id}/generate
GET /api/tasks/{task_id}
POST /api/tasks/{task_id}/cancel
POST /api/tasks/{task_id}/retry
```

请求示例：

```json
{
  "input_file_id": "file_001",
  "input_type": "floor_plan",
  "style": "modern_luxury",
  "generation_level": "furnished_scene",
  "rooms": ["living_room", "bedroom", "kitchen"],
  "options": {
    "ceiling_height": 2.8,
    "include_furniture": true,
    "include_lighting": true
  }
}
```

---

## 12.4 场景 API

```http
GET /api/projects/{project_id}/scene
PATCH /api/projects/{project_id}/scene
POST /api/projects/{project_id}/scene/export-glb
POST /api/projects/{project_id}/scene/render-preview
```

---

## 12.5 资产 API

```http
GET /api/assets
GET /api/assets/{asset_id}
GET /api/materials
GET /api/styles
```

---

# 13. 几何生成实现思路

## 13.1 墙体生成

输入二维线段：

```json
{
  "start": [0, 0],
  "end": [5, 0],
  "thickness": 0.2,
  "height": 2.8
}
```

生成过程：

```text
1. 根据 start/end 计算墙体方向
2. 计算法线方向
3. 按 thickness 扩展成矩形
4. 向 Y 轴或 Z 轴拉伸成墙体 mesh
5. 生成 UV
6. 应用墙面材质
```

Three.js 中推荐坐标约定：

```text
X：水平横向
Y：高度
Z：平面纵向
```

即户型图里的二维坐标 `[x, y]` 可以映射为 Three.js 的 `[x, 0, z]`。

---

## 13.2 地面生成

房间 polygon 转 mesh：

```text
1. 读取房间 polygon
2. 使用 Shape 生成 2D 形状
3. 转成 Three.js ShapeGeometry
4. 旋转到 XZ 平面
5. 应用地板材质
```

---

## 13.3 天花板生成

与地面类似：

```text
1. 复制房间 polygon
2. 高度设置为 ceiling_height
3. 生成 ceiling mesh
4. 应用天花板材质
```

---

## 13.4 门窗洞口

MVP 可以简化：

```text
不做真实布尔裁剪
直接在墙体上放置门/窗模型
墙体仍保持完整
```

这样速度快，但视觉上不够真实。

第二阶段再做：

```text
使用 CSG / mesh boolean
在墙体上切出门窗洞口
```

---

# 14. GLB / glTF 导出策略

## 14.1 MVP 方案

后端生成 Home Scene JSON，前端根据 JSON 动态渲染。

优点：

```text
开发快
容易编辑
容易调试
```

缺点：

```text
不是独立模型文件
导出需要额外处理
```

## 14.2 中期方案

后端或前端将场景打包成 GLB。

```text
Home Scene JSON
    ↓
Geometry Builder
    ↓
Merge Mesh
    ↓
Apply Materials
    ↓
Embed Assets
    ↓
Export GLB
```

推荐：

```text
Three.js GLTFExporter
或 Python pygltflib
```

如果主要在客户端生成模型，Three.js GLTFExporter 会比较自然。

---

# 15. 资产库设计

## 15.1 资产分类

```text
sofa
chair
dining_table
coffee_table
bed
wardrobe
cabinet
tv_cabinet
kitchen_cabinet
bathroom_vanity
toilet
shower
lamp
curtain
rug
plant
decoration
door
window
```

## 15.2 资产规范

每个资产需要：

```text
1. GLB 文件
2. 预览图
3. 真实尺寸
4. 原点规范
5. 朝向规范
6. 风格标签
7. 颜色标签
8. 材质标签
9. 授权信息
```

## 15.3 原点规范

建议统一：

```text
家具底部中心点作为 origin
正面朝向 -Z
单位为 meter
```

这样摆放和旋转会简单很多。

---

# 16. Prompt 设计

## 16.1 户型图解析 Prompt

用于 VLM：

```text
You are an architectural floor plan analysis assistant.

Analyze the uploaded floor plan image. Extract the rooms, walls, doors, windows, and spatial relationships.

Return only valid JSON. Do not include markdown.

The JSON schema should include:
- rooms: id, type, name, approximate polygon, confidence
- walls: start, end, thickness, confidence
- doors: position, width, connected_rooms, swing_direction, confidence
- windows: position, width, wall_ref, confidence
- scale_info: whether scale is detected, estimated meters per pixel
- warnings: possible ambiguities
```

---

## 16.2 设计规划 Prompt

用于 LLM：

```text
You are an interior design planner.

Given a structured home scene JSON, generate a furniture layout plan.

Rules:
- Do not change the architectural structure.
- Keep walking paths clear.
- Furniture must fit inside the room polygon.
- Use realistic furniture sizes.
- Match the selected interior style.
- Return only JSON.

Selected style: modern_luxury
User requirement: warm, premium, suitable for a small family.
```

---

## 16.3 结果校验 Prompt

用于检查布局合理性：

```text
You are a layout validation assistant.

Check whether the furniture layout is reasonable.

Validate:
- furniture inside room boundary
- no major collision
- walking path is clear
- furniture scale is realistic
- style consistency

Return JSON with:
- valid: boolean
- issues: array
- suggestions: array
```

---

# 17. 前端目录结构建议

```text
src/
  app/
    App.tsx
    routes.tsx

  components/
    layout/
      AppShell.tsx
      Sidebar.tsx
      Topbar.tsx

    upload/
      FileUploader.tsx
      FloorPlanPreview.tsx

    project/
      ProjectList.tsx
      ProjectCard.tsx

    generation/
      GenerationPanel.tsx
      TaskProgress.tsx
      StyleSelector.tsx
      InputTypeSelector.tsx

    viewer/
      SceneViewer.tsx
      SceneCanvas.tsx
      OrbitControlsLayer.tsx
      WalkControlsLayer.tsx
      CameraPresetPanel.tsx
      ObjectInspector.tsx
      MaterialPanel.tsx
      ExportPanel.tsx

    assets/
      AssetBrowser.tsx
      AssetCard.tsx

  stores/
    projectStore.ts
    sceneStore.ts
    viewerStore.ts
    taskStore.ts

  api/
    client.ts
    projects.ts
    tasks.ts
    scenes.ts
    assets.ts

  types/
    scene.ts
    project.ts
    asset.ts
    task.ts

  utils/
    geometry.ts
    export.ts
    file.ts
```

---

# 18. 后端目录结构建议

```text
backend/
  app/
    main.py

    api/
      projects.py
      files.py
      tasks.py
      scenes.py
      assets.py

    core/
      config.py
      database.py
      storage.py
      queue.py

    models/
      project.py
      file.py
      task.py
      scene.py
      asset.py

    schemas/
      home_scene.py
      task.py
      asset.py

    services/
      file_service.py
      project_service.py
      scene_service.py
      asset_service.py

    pipeline/
      preprocess.py
      floorplan_parser.py
      scene_normalizer.py
      geometry_generator.py
      furniture_planner.py
      asset_matcher.py
      material_engine.py
      glb_exporter.py

    workers/
      task_worker.py

    ai/
      vlm_client.py
      llm_client.py
      prompts.py

  tests/
```

---

# 19. MVP 开发计划

## 第 1 阶段：客户端基础框架，1~2 周

目标：

```text
1. 搭建 Tauri + React + TypeScript 项目
2. 完成基础 UI
3. 完成文件上传页面
4. 完成项目管理页面
5. 完成 Three.js Viewer 原型
6. 支持加载本地 GLB 文件
```

交付物：

```text
可运行桌面 App
可上传户型图
可打开一个测试 GLB 场景
可使用 OrbitControls 浏览
```

---

## 第 2 阶段：3D 白模生成，2~3 周

目标：

```text
1. 设计 Home Scene JSON v0.1
2. 手写几个测试户型 JSON
3. 根据 JSON 生成墙、地面、天花板
4. 在 Viewer 中加载生成结果
5. 支持第一人称漫游
```

交付物：

```text
不依赖 AI，也能从 JSON 生成可漫游 3D 白模
```

这是最重要的技术底座。

---

## 第 3 阶段：户型图解析 MVP，2~4 周

目标：

```text
1. 支持上传户型图
2. 调用 VLM 生成房间结构 JSON
3. 后端规范化为 Home Scene JSON
4. 生成 3D 白模
5. 返回客户端预览
```

交付物：

```text
上传简单户型图后，可以生成粗略 3D 空间
```

注意：此阶段不要追求复杂户型 100% 正确，先支持简单、清晰、规则的户型图。

---

## 第 4 阶段：基础家具和材质，2~3 周

目标：

```text
1. 建立小型 GLB 资产库
2. 支持自动摆放基础家具
3. 支持现代轻奢、奶油风、北欧 3 种风格
4. 支持材质模板
5. 支持灯光模板
```

交付物：

```text
生成出来的不再是空壳，而是有基础装修和家具的室内空间
```

---

## 第 5 阶段：编辑和导出，2~3 周

目标：

```text
1. 支持点击选择家具
2. 支持拖动家具
3. 支持删除家具
4. 支持替换材质
5. 支持当前视角截图
6. 支持导出 GLB
```

交付物：

```text
用户可以修改 AI 生成结果，并导出模型或图片
```

---

# 20. 风险分析

## 20.1 户型图解析不稳定

风险：

```text
不同户型图差异巨大，VLM 可能误判墙体、门窗和房间。
```

解决：

```text
1. MVP 阶段只支持清晰规则户型图
2. 给用户提供手动修正界面
3. 让 AI 输出 confidence
4. 低置信度区域提示用户确认
5. 后续支持 CAD/DXF 降低识别难度
```

---

## 20.2 3D 结果不够美观

风险：

```text
白模和低质量家具会导致用户感知较差。
```

解决：

```text
1. 优先打磨 3 个高质量风格模板
2. 使用统一资产规范
3. 做好灯光和材质
4. 默认给用户展示最佳相机位
```

---

## 20.3 家具布局不合理

风险：

```text
家具可能挡门、贴墙错误、比例不合适。
```

解决：

```text
1. 用规则系统做硬约束
2. LLM 只做规划，不直接给最终坐标
3. 使用碰撞检测
4. 添加布局校验器
```

---

## 20.4 WebGL 性能问题

风险：

```text
整屋模型太大，Tauri 内嵌 WebView 渲染卡顿。
```

解决：

```text
1. 控制资产面数
2. 使用 glTF 压缩
3. 使用纹理压缩
4. 房间级 lazy loading
5. 合并静态 mesh
6. 限制实时阴影数量
```

---

# 21. 推荐优先级

## 必须优先做

```text
1. Home Scene JSON
2. JSON 到 3D 白模
3. Three.js Viewer
4. 第一人称漫游
5. 项目和任务系统
```

## 第二优先级

```text
1. 户型图 AI 解析
2. 基础家具布局
3. 风格材质模板
4. GLB 导出
```

## 第三优先级

```text
1. 高质量资产库
2. 用户编辑器
3. 效果图渲染
4. CAD/DXF 导入
5. 多端同步
```

---

# 22. 建议的 MVP 验收标准

MVP 完成后，应该能做到：

```text
用户上传一张清晰户型图
系统在 1~3 分钟内生成一个 3D 室内空间
用户可以在空间内自由漫游
用户可以切换到客厅、卧室、厨房等预设视角
用户可以看到基础墙体、地面、门窗、家具和灯光
用户可以导出当前视角图片
用户可以导出 GLB 文件
```

不需要一开始做到：

```text
100% 精确识别所有图纸
专业级施工图还原
复杂吊顶建模
真实物理级光线追踪
所有家具可商购匹配
```

---

# 23. 关键结论

这个项目的核心不是“AI 生成图片”，而是：

```text
AI + 规则引擎 + 3D 资产库 + 实时渲染器
```

推荐主技术路线是：

```text
户型图解析
    ↓
Home Scene JSON
    ↓
参数化 3D 建模
    ↓
家具资产组装
    ↓
材质灯光模板
    ↓
Three.js 可漫游 Viewer
```

Tauri + Three.js 是非常合适的客户端技术选择。真正需要重点投入的是：

```text
1. Home Scene JSON 设计
2. 2D 户型到 3D 几何的转换
3. 家具资产库和布局规则
4. Viewer 的交互体验
```

我的建议是：**第一版不要追求“AI 自动生成完美装修效果”，而是先做出“从户型图生成可漫游 3D 白模 + 基础家具”的稳定闭环。**

只要这个闭环跑通，后续增加风格化、美化、编辑、效果图渲染，都会变得非常自然。


