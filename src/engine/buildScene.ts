import * as THREE from 'three'
import type { HomeSceneJSON, HomeSceneGlobal, SceneObject, SceneMaterial } from '@/types/scene'
import { buildWalls, type BuiltWall } from './buildWalls'
import { buildFloors, type BuiltFloor } from './buildFloors'
import { buildCeilings, type BuiltCeiling } from './buildCeilings'
import { buildOpenings, type BuiltOpening } from './buildOpenings'
import { buildObjects, type BuiltObject } from './buildObjects'
import { clearMaterialCache } from './materials'
import { clearTextureCache } from './proceduralTextures'
import { furnitureCatalog } from '@/data/furnitureCatalog'
import { createFurnitureModel } from './furnitureModels'

export interface BuiltScene {
  group: THREE.Group
  walls: BuiltWall[]
  floors: BuiltFloor[]
  ceilings: BuiltCeiling[]
  openings: BuiltOpening[]
  objects: BuiltObject[]
}

function applyTextureOverrides(
  materials: SceneMaterial[],
  overrides?: HomeSceneGlobal['texture_overrides'],
): SceneMaterial[] {
  if (!overrides) return materials
  return materials.map((mat) => {
    if (mat.texture_urls?.base_color) return mat // already has texture
    if (mat.id.includes('_floor') && overrides.floor) {
      return { ...mat, texture_urls: { ...mat.texture_urls, base_color: `texture://${overrides.floor}` } }
    }
    if (mat.id.includes('_wall') && overrides.wall) {
      return { ...mat, texture_urls: { ...mat.texture_urls, base_color: `texture://${overrides.wall}` } }
    }
    if (mat.id.includes('_ceiling') && overrides.ceiling) {
      return { ...mat, texture_urls: { ...mat.texture_urls, base_color: `texture://${overrides.ceiling}` } }
    }
    return mat
  })
}

function buildObjectFromScene(obj: SceneObject): BuiltObject {
  const def = furnitureCatalog[obj.category]
  const col = def?.color || '#888888'

  const group = createFurnitureModel(obj.category, obj.size, col)
  group.position.set(obj.position[0], obj.position[1], obj.position[2])
  group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
  group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])
  group.name = obj.id

  return { id: obj.id, mesh: group, sceneObject: obj }
}

export function buildScene(scene: HomeSceneJSON): BuiltScene {
  clearMaterialCache()
  clearTextureCache()

  const textureOverrides = scene.global.texture_overrides
  const materials = applyTextureOverrides(scene.materials, textureOverrides)

  const walls = buildWalls(scene.walls, materials, textureOverrides?.wall)
  const floors = buildFloors(scene.rooms, materials, textureOverrides?.floor)
  const ceilings = buildCeilings(scene.rooms, scene.global.ceiling_height, materials, textureOverrides?.ceiling)
  const openings = buildOpenings(scene.openings, scene.walls)

  // Use pre-existing objects from scene JSON, or auto-generate
  let objects: BuiltObject[]
  if (scene.objects && scene.objects.length > 0) {
    objects = scene.objects.map(buildObjectFromScene)
  } else {
    objects = buildObjects(scene.rooms, scene.openings)
  }

  const group = new THREE.Group()
  group.name = `home_scene_${scene.project.id}`

  // Structure group: floors + walls merged
  const structureGroup = new THREE.Group()
  structureGroup.name = 'structure'

  for (const floor of floors) {
    structureGroup.add(floor.mesh)
  }

  for (const wall of walls) {
    structureGroup.add(wall.mesh)
  }

  group.add(structureGroup)

  for (const opening of openings) {
    group.add(opening.mesh)
  }

  for (const obj of objects) {
    group.add(obj.mesh)
  }

  for (const ceiling of ceilings) {
    group.add(ceiling.mesh)
  }

  return { group, walls, floors, ceilings, openings, objects }
}

export function disposeScene(built: BuiltScene): void {
  built.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose())
      } else {
        child.material.dispose()
      }
    }
  })
  clearMaterialCache()
  clearTextureCache()
}
