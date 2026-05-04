import * as THREE from 'three'
import type { Opening, Wall } from '@/types/scene'
import {
  createDoorGeometry,
  createWindowGeometry,
  wallNormal,
} from './geometryUtils'
import { createDoorMaterial, createWindowMaterial } from './materials'

export interface BuiltOpening {
  id: string
  mesh: THREE.Mesh
  type: 'door' | 'window'
}

/**
 * Build door and window placeholder meshes.
 * For MVP: these are simple colored boxes placed on the wall surface.
 * No boolean cutouts on the wall geometry.
 */
export function buildOpenings(
  openings: Opening[],
  walls: Wall[]
): BuiltOpening[] {
  const wallMap = new Map(walls.map((w) => [w.id, w]))
  const doorMat = createDoorMaterial()
  const windowMat = createWindowMaterial()

  return openings.map((opening) => {
    const wall = wallMap.get(opening.wall_ref)
    if (!wall) {
      // Wall not found, create a dummy mesh at opening position
      const geo = new THREE.BoxGeometry(opening.width, opening.height, 0.1)
      const mesh = new THREE.Mesh(geo, opening.type === 'door' ? doorMat : windowMat)
      mesh.position.set(opening.position[0], opening.sill_height + opening.height / 2, opening.position[1])
      mesh.name = opening.id
      return { id: opening.id, mesh, type: opening.type }
    }

    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const angle = Math.atan2(dz, dx)
    const normal = wallNormal(wall.start, wall.end)

    let geometry: THREE.BufferGeometry
    let material: THREE.Material

    if (opening.type === 'door') {
      geometry = createDoorGeometry(opening.width, opening.height)
      material = doorMat
    } else {
      geometry = createWindowGeometry(opening.width, opening.height)
      material = windowMat
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = opening.id

    // Position: opening.position is the center-point on the wall in 2D
    // Offset slightly outward from wall center by half thickness
    const yOffset = opening.sill_height + opening.height / 2
    const offsetX = normal[0] * (wall.thickness / 2 + 0.01)
    const offsetZ = normal[1] * (wall.thickness / 2 + 0.01)

    mesh.position.set(
      opening.position[0] + offsetX,
      yOffset,
      opening.position[1] + offsetZ
    )
    mesh.rotation.y = -angle

    return { id: opening.id, mesh, type: opening.type }
  })
}
