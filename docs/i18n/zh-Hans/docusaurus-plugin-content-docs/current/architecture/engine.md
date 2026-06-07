---
sidebar_position: 4
title: 3D 引擎
---

# 3D 引擎

Planova 的 3D 引擎将 `HomeSceneJSON` 文档转换为实时 Three.js 场景。所有引擎代码位于 `src/engine/`，纯数据驱动——不依赖 React，可在 UI 之外使用。

## 场景构建流水线

从解析后的 JSON 到可渲染几何体的完整流水线：

```
HomeSceneJSON
    │
    ▼
buildScene()                    ← 编排器
    ├─ clearMaterialCache()
    ├─ clearTextureCache()
    ├─ applyTextureOverrides()  ← 将全局 texture_overrides 合并到材质中
    ├─ buildWalls()             ← 墙体几何体 + 材质
    ├─ buildFloors()            ← 从房间多边形生成地面板块
    ├─ buildCeilings()          ← 在 ceiling_height 高度生成天花板平面
    ├─ buildOpenings()          ← 门和窗模型
    └─ buildObjects()           ← 家具放置（预定义或自动生成）
    │
    ▼
THREE.Group（场景图根节点）
```

### buildScene 编排器

`src/engine/buildScene.ts` 中的 `buildScene()` 是唯一入口点。它：

1. **清空缓存** -- 释放所有缓存的材质和纹理，避免场景重新加载时的陈旧 GPU 资源。
2. **应用纹理覆盖** -- `applyTextureOverrides()` 修补 ID 中包含 `_floor`、`_wall` 或 `_ceiling` 的材质，使用全局覆盖的纹理 URL（使用 `texture://` 协议引用程序化预设）。
3. **委托给子构建器** -- 每个构建器返回类型化的 `{ id, mesh }` 对象数组。
4. **处理物体** -- 如果场景 JSON 已包含 `objects`，每个物体通过 `buildObjectFromScene()` 直接构建（查找家具目录并调用 `createFurnitureModel`）。否则，`buildObjects()` 会根据房间布局自动生成家具放置。
5. **组装场景图** -- 创建一个根 `THREE.Group`，添加 `structure` 子组（合并的地面 + 墙体），然后追加开洞、物体和天花板作为直接子节点。

该函数返回一个 `BuiltScene` 对象，包含 Group 和所有类型化子数组，使下游代码（如 `ObjectEditor`）能够通过 ID 访问特定网格。

`disposeScene()` 遍历整个 Group，释放每个几何体和材质，然后再次清空缓存。

## 子构建器

### buildWalls

`src/engine/buildWalls.ts`

每个墙体是一个 `THREE.Mesh`。几何体由 `geometryUtils` 中的 `createWallGeometry()` 创建，根据墙体的起止位置、高度和厚度计算旋转盒体。材质选择采用级联逻辑：

1. 如果墙体声明了 `material` ID，则在场景的材质数组中查找。
2. 如果设置了 `texture_override` 且是着色器预设（`isShaderPreset`），则使用 `createShaderMaterial()`。
3. 否则，回退到使用纹理覆盖的 `createWallMaterial()`。

所有墙体网格启用 `castShadow` 和 `receiveShadow`。

### buildFloors

`src/engine/buildFloors.ts`

每个房间生成一个地面网格。几何体是一个 **4 厘米厚的 `BoxGeometry`**（非平面），从房间多边形的轴对齐包围盒计算得出。这确保地面在任何角度下都可见。板块平移后使其顶面位于 y=0。

材质解析逻辑与墙体一致：房间特定的 `floor_material` ID、着色器预设覆盖，或默认的 `createFloorMaterial()`。

每个 `BuiltFloor` 还暴露计算出的 `area`（来自 `room.area` 或 `computePolygonArea()`）。

### buildCeilings

`src/engine/buildCeilings.ts`

天花板使用 `ShapeGeometry`，由 `createPolygonGeometry()` 根据房间多边形创建。每个天花板网格位于 `ceiling_height` 高度，`scale.y = -1` 使其法线朝下。运行时通过 `viewerStore.showCeilings` 切换可见性。

### buildOpenings

`src/engine/buildOpenings.ts`

门和窗由盒体基元程序化建模：

**门**由以下部分组成：
- 门框：三根条带（左、右、顶）和门槛，使用木棕色的 `MeshStandardMaterial`。
- 门板：一个内缩矩形，根据开启方向有轻微偏移。
- 门把手：一个位于锁舌侧的 `CylinderGeometry`。

**窗**由以下部分组成：
- 窗框：四根条带组成的矩形。
- 玻璃：一块薄透明面板（`opacity: 0.4`）。
- 窗棂：垂直和水平的十字条。

每个开洞是一个 `THREE.Group`，定位并旋转到其所属墙体中。

### buildObjects

`src/engine/buildObjects.ts`

当场景 JSON 不包含预定义物体时，处理自动家具放置。算法如下：

1. **房间分类** -- 使用 `furnitureLayout.ts` 中的 `roomFurnitureMap` 按类型（卧室、客厅、厨房、浴室等）对每个房间分类。
2. **包围盒计算** -- 将房间多边形转换为轴对齐包围盒。
3. **门禁区** -- 识别门的位置，并应用 0.8m 的排除半径，防止家具堵塞门口。
4. **放置** -- 使用 `PlacementZone` 规则（房间包围盒的上、下、左、右）沿墙放置家具。每次放置都检查与已放置物体的 AABB 重叠。
5. **碰撞解决** -- `resolvePosition()` 沿墙体方向微调重叠物体，直到找到有效位置或达到尝试次数上限。

每个 `BuiltObject` 包含 `id`、`THREE.Group` 网格和 `SceneObject` 数据记录。

## 材质系统

### 材质工厂与缓存

`src/engine/materials.ts`

一个 `Map<string, THREE.Material>` 缓存，以材质 ID 为键。工厂函数创建 `MeshStandardMaterial` 实例，带有合理的默认值：

| 函数 | 默认颜色 | 粗糙度 | 备注 |
|------|----------|--------|------|
| `createWallMaterial` | `#E8E4DF` | 0.85 | DoubleSide |
| `createFloorMaterial` | `#D9D2C5` | 0.7 | DoubleSide |
| `createCeilingMaterial` | `#FFFFFF` | 0.9 | DoubleSide |
| `createDoorMaterial` | `#8B6F47` | 0.6 | metalness 0.1 |
| `createWindowMaterial` | `#B5D4E8` | 0.1 | transparent, opacity 0.4 |

`getMaterial()` 从场景 JSON 中解析 `SceneMaterial`，应用 `base_color`、`roughness`、`metalness`、`transparent` 和 `opacity` 字段。如果材质的 `texture_urls.base_color` 使用 `texture://` 协议，则获取对应的程序化纹理作为漫反射贴图。

`clearMaterialCache()` 释放所有缓存材质，在每次 `buildScene()` 调用开始时执行。

### 着色器材质

`src/engine/shaderMaterials.ts`

通过 `MeshStandardMaterial.onBeforeCompile` 实现了四个 GLSL 着色器预设：

| 预设 ID | 描述 |
|---------|------|
| `wood_grain` | 程序化木纹，带纹理线条、环形图案和 FBM 噪声 |
| `marble_vein` | 大理石，带流动纹理、基色变化和镜面光泽 |
| `concrete_proc` | 混凝土，带细噪声、骨料斑点和微纹理 |
| `stone_proc` | 石砌体，带砖块图案、砂浆线条和逐砖颜色变化 |

每个预设定义：
- `uniforms` -- 着色器参数（频率、颜色、缩放）
- `fragmentFunctions` -- GLSL 辅助函数（共享一个通用 `NOISE_HELPERS` 块，包含 `hash21_sh`、`valueNoise_sh` 和 `fbm_sh`）
- `fragmentInjection` -- 注入到 `<map_fragment>` 中以覆盖 `diffuseColor` 的代码
- `vertexInjection` -- 将 `vWorldPosition` 从顶点着色器传递到片元着色器的代码

`createShaderMaterial()` 构建一个 `MeshStandardMaterial`，然后通过 `onBeforeCompile` 的字符串替换修补其着色器源码。`customProgramCacheKey` 设置为预设 ID，以便 Three.js 正确缓存编译后的程序。

### 程序化纹理

`src/engine/proceduralTextures.ts`

20 多个基于 canvas 的纹理预设，在运行时生成。每个预设是一个函数 `(size: number) => HTMLCanvasElement`，使用 Canvas 2D API 绘制可平铺纹理。类别如下：

**地面预设：** 橡木板、大理石砖、混凝土、人字形、深胡桃木、赤陶、瓷砖、网格砖。

**墙面预设：** 白色灰泥、地铁砖、红砖、木板、石墙、裸混凝土。

**天花板预设：** 光滑白、平面白、藻井。

**着色器预设预览：** 木纹、大理石纹理、混凝土、石材（纹理选择器 UI 的小预览）。

纹理使用种子化 RNG（`seededRandom`）实现确定性噪声，`addNoise()` 应用像素级颗粒感。生成的 canvas 缓存在 `Map` 中，按需通过 `getTexture()` 转换为 `THREE.CanvasTexture`。

`clearTextureCache()` 释放所有缓存的纹理和 canvas。

## 家具模型

`src/engine/furnitureModels.ts`

15 种程序化家具类型，由盒体、圆柱和球体基元构建：

| 类别 | 构建函数 | 主要基元 |
|------|----------|----------|
| `sofa` | `buildSofa` | 盒体座面、靠背、扶手；圆柱腿 |
| `coffee_table` | `buildCoffeeTable` | 盒体桌面 + 腿 |
| `tv_stand` | `buildTvStand` | 盒体柜体 + 隔板 |
| `bed` | `buildBed` | 盒体床垫、床架、床头板 |
| `nightstand` | `buildNightstand` | 盒体柜体 + 抽屉线 |
| `wardrobe` | `buildWardrobe` | 盒体柜体 + 分隔线 |
| `dining_table` | `buildDiningTable` | 盒体桌面 + 圆柱腿 |
| `dining_chair` | `buildDiningChair` | 盒体座面、靠背；圆柱腿 |
| `desk` | `buildDesk` | 盒体桌面 + 腿 + 抽屉 |
| `bookshelf` | `buildBookshelf` | 盒体框架 + 随机书本盒体 |
| `bathroom_sink` | `buildBathroomSink` | 盒体台面 + 圆柱水槽 |
| `toilet` | `buildToilet` | 盒体底座 + 圆柱马桶 + 盒体水箱 |
| `shower` | `buildShower` | 盒体底盘 + 透明玻璃墙 |
| `kitchen_counter` | `buildKitchenCounter` | 盒体柜体 + 台面 |
| `fridge` | `buildFridge` | 盒体柜体 + 圆柱把手 |

所有构建器使用辅助函数 `box()`、`cyl()` 和 `sphere()`，创建带阴影投射的定位网格。颜色辅助函数 `darken()` 和 `lighten()` 从单一基色生成强调色。

`createFurnitureModel(category, size, color)` 是公共入口点。它按类别查找构建器，并将结果 Group 缩放到请求的尺寸。未知类别回退到 `buildFallback`——一个简单的彩色盒体。

## 场景图结构

`buildScene()` 组装的最终 Three.js 场景图：

```
THREE.Group  "home_scene_{projectId}"
 ├─ THREE.Group  "structure"
 │   ├─ THREE.Mesh  "floor_{roomId}"      (BoxGeometry, 每个房间)
 │   ├─ THREE.Mesh  "wall_{wallId}"        (rotated BoxGeometry, 每面墙)
 │   ...
 ├─ THREE.Group  "{openingId}"             (门或窗, 每个开洞)
 │   ├─ THREE.Mesh  (frame strips)
 │   ├─ THREE.Mesh  (panel / glass)
 │   └─ THREE.Mesh  (handle / mullions)
 ├─ THREE.Group  "{objectId}"              (家具, 每个物体)
 │   ├─ THREE.Mesh  (body)
 │   ├─ THREE.Mesh  (accent parts)
 │   ...
 └─ THREE.Mesh  "ceiling_{roomId}"         (ShapeGeometry, 每个房间)
```

`structure` 子组合并了地面和墙体，以便高效裁剪。开洞和物体是独立的顶层子节点，可以单独选择、变换或移除。天花板是最后的子节点，渲染在最上层，并可通过 `viewerStore.showCeilings` 切换。
