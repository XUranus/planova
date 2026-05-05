import * as THREE from 'three'
import type { Room, SceneMaterial } from '@/types/scene'
import { computePolygonArea } from './geometryUtils'
import { createFloorMaterial, getMaterialById } from './materials'

export interface BuiltFloor {
  id: string
  mesh: THREE.Mesh
  area: number
}

/**
 * Create a thin box slab from the room polygon's bounding box.
 * Uses a real 3D box (not a flat plane) so the floor is always visible.
 */
function createFloorSlab(polygon: [number, number][], thickness = 0.04): THREE.BufferGeometry {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [x, z] of polygon) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  const w = maxX - minX
  const d = maxZ - minZ
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2

  const geo = new THREE.BoxGeometry(w, thickness, d)
  geo.translate(cx, -thickness / 2, cz)
  return geo
}

export function buildFloors(rooms: Room[], materials: SceneMaterial[] = [], textureOverride?: string): BuiltFloor[] {
  return rooms.map((room) => {
    const geometry = createFloorSlab(room.polygon)

    let material: THREE.MeshStandardMaterial
    if (room.floor_material) {
      const found = getMaterialById(materials, room.floor_material)
      material = found ?? createFloorMaterial(undefined, textureOverride)
    } else {
      material = createFloorMaterial(undefined, textureOverride)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `floor_${room.id}`
    mesh.receiveShadow = true
    mesh.castShadow = false

    const area = room.area ?? computePolygonArea(room.polygon)

    return { id: room.id, mesh, area }
  })
}
