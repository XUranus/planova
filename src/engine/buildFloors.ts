import * as THREE from 'three'
import type { Room } from '@/types/scene'
import { createPolygonGeometry, computePolygonArea } from './geometryUtils'
import { createFloorMaterial } from './materials'

export interface BuiltFloor {
  id: string
  mesh: THREE.Mesh
  area: number
}

/**
 * Build floor meshes from room definitions.
 * Each room floor is a separate mesh for future per-room material editing.
 */
export function buildFloors(rooms: Room[]): BuiltFloor[] {
  return rooms.map((room) => {
    const geometry = createPolygonGeometry(room.polygon)
    const material = createFloorMaterial(room.floor_material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `floor_${room.id}`
    mesh.receiveShadow = true

    const area = room.area ?? computePolygonArea(room.polygon)

    return { id: room.id, mesh, area }
  })
}
