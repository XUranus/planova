import * as THREE from 'three'
import type { Room, SceneMaterial } from '@/types/scene'
import { createPolygonGeometry } from './geometryUtils'
import { createCeilingMaterial, getMaterialById } from './materials'

export interface BuiltCeiling {
  id: string
  mesh: THREE.Mesh
}

export function buildCeilings(
  rooms: Room[],
  ceilingHeight: number,
  materials: SceneMaterial[] = [],
  textureOverride?: string,
): BuiltCeiling[] {
  return rooms.map((room) => {
    const geometry = createPolygonGeometry(room.polygon)

    let material: THREE.MeshStandardMaterial
    if (room.ceiling_material) {
      const found = getMaterialById(materials, room.ceiling_material)
      material = found ?? createCeilingMaterial(textureOverride)
    } else {
      material = createCeilingMaterial(textureOverride)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `ceiling_${room.id}`
    mesh.position.y = ceilingHeight
    mesh.scale.y = -1
    mesh.receiveShadow = true

    return { id: room.id, mesh }
  })
}
