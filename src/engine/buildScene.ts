import * as THREE from 'three'
import type { HomeSceneJSON } from '@/types/scene'
import { buildWalls, type BuiltWall } from './buildWalls'
import { buildFloors, type BuiltFloor } from './buildFloors'
import { buildCeilings, type BuiltCeiling } from './buildCeilings'
import { buildOpenings, type BuiltOpening } from './buildOpenings'
import { clearMaterialCache } from './materials'

export interface BuiltScene {
  group: THREE.Group
  walls: BuiltWall[]
  floors: BuiltFloor[]
  ceilings: BuiltCeiling[]
  openings: BuiltOpening[]
}

/**
 * Build a complete 3D scene from Home Scene JSON.
 * Returns a THREE.Group containing all meshes, ready to add to a scene.
 */
export function buildScene(scene: HomeSceneJSON): BuiltScene {
  clearMaterialCache()

  const walls = buildWalls(scene.walls)
  const floors = buildFloors(scene.rooms)
  const ceilings = buildCeilings(scene.rooms, scene.global.ceiling_height)
  const openings = buildOpenings(scene.openings, scene.walls)

  const group = new THREE.Group()
  group.name = `home_scene_${scene.project.id}`

  // Add floors first (bottom layer)
  for (const floor of floors) {
    group.add(floor.mesh)
  }

  // Add walls
  for (const wall of walls) {
    group.add(wall.mesh)
  }

  // Add openings (doors and windows)
  for (const opening of openings) {
    group.add(opening.mesh)
  }

  // Add ceilings last (top layer)
  for (const ceiling of ceilings) {
    group.add(ceiling.mesh)
  }

  return { group, walls, floors, ceilings, openings }
}

/**
 * Dispose all geometries and materials in a built scene.
 */
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
