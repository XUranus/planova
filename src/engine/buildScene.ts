import * as THREE from 'three'
import type { HomeSceneJSON, SceneObject } from '@/types/scene'
import { buildWalls, type BuiltWall } from './buildWalls'
import { buildFloors, type BuiltFloor } from './buildFloors'
import { buildCeilings, type BuiltCeiling } from './buildCeilings'
import { buildOpenings, type BuiltOpening } from './buildOpenings'
import { buildObjects, type BuiltObject } from './buildObjects'
import { clearMaterialCache } from './materials'
import { furnitureCatalog } from '@/data/furnitureCatalog'

export interface BuiltScene {
  group: THREE.Group
  walls: BuiltWall[]
  floors: BuiltFloor[]
  ceilings: BuiltCeiling[]
  openings: BuiltOpening[]
  objects: BuiltObject[]
}

function buildObjectFromScene(obj: SceneObject): BuiltObject {
  const group = new THREE.Group()
  const [w, h, d] = obj.size

  const def = furnitureCatalog[obj.category]
  const color = def?.color || '#888888'

  const geometry = new THREE.BoxGeometry(w, h, d)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.7,
    metalness: 0.0,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = h / 2
  mesh.castShadow = true
  mesh.receiveShadow = true

  group.add(mesh)
  group.position.set(obj.position[0], obj.position[1], obj.position[2])
  group.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
  group.scale.set(obj.scale[0], obj.scale[1], obj.scale[2])
  group.name = obj.id

  return { id: obj.id, mesh: group, sceneObject: obj }
}

export function buildScene(scene: HomeSceneJSON): BuiltScene {
  clearMaterialCache()

  const materials = scene.materials
  const walls = buildWalls(scene.walls, materials)
  const floors = buildFloors(scene.rooms, materials)
  const ceilings = buildCeilings(scene.rooms, scene.global.ceiling_height, materials)
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

  for (const floor of floors) {
    group.add(floor.mesh)
  }

  for (const wall of walls) {
    group.add(wall.mesh)
  }

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
}
