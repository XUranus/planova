import * as THREE from 'three'
import type { Room } from '@/types/scene'
import { createPolygonGeometry } from './geometryUtils'
import { createCeilingMaterial } from './materials'

export interface BuiltCeiling {
  id: string
  mesh: THREE.Mesh
}

/**
 * Build ceiling meshes from room definitions.
 * Ceilings are placed at the global ceiling height.
 */
export function buildCeilings(rooms: Room[], ceilingHeight: number): BuiltCeiling[] {
  const material = createCeilingMaterial()

  return rooms.map((room) => {
    const geometry = createPolygonGeometry(room.polygon)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `ceiling_${room.id}`
    mesh.position.y = ceilingHeight
    // Flip normal so it faces downward
    mesh.scale.y = -1
    mesh.receiveShadow = true

    return { id: room.id, mesh }
  })
}
