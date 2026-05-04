import * as THREE from 'three'
import type { Wall } from '@/types/scene'
import { createWallGeometry } from './geometryUtils'
import { createWallMaterial } from './materials'

export interface BuiltWall {
  id: string
  mesh: THREE.Mesh
}

/**
 * Build wall meshes from the scene's wall definitions.
 * Each wall is an independent mesh for future per-wall editing.
 */
export function buildWalls(walls: Wall[]): BuiltWall[] {
  const material = createWallMaterial()

  return walls.map((wall) => {
    const geometry = createWallGeometry(wall)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = wall.id
    mesh.castShadow = true
    mesh.receiveShadow = true

    return { id: wall.id, mesh }
  })
}
