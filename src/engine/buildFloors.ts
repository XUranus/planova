import * as THREE from 'three'
import type { Room, SceneMaterial } from '@/types/scene'
import { createPolygonGeometry, computePolygonArea } from './geometryUtils'
import { createFloorMaterial, getMaterialById } from './materials'

export interface BuiltFloor {
  id: string
  mesh: THREE.Mesh
  area: number
}

export function buildFloors(rooms: Room[], materials: SceneMaterial[] = [], textureOverride?: string): BuiltFloor[] {
  return rooms.map((room) => {
    const geometry = createPolygonGeometry(room.polygon)

    let material: THREE.MeshStandardMaterial
    if (room.floor_material) {
      const found = getMaterialById(materials, room.floor_material)
      material = found ?? createFloorMaterial(room.floor_material, textureOverride)
    } else {
      material = createFloorMaterial(undefined, textureOverride)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `floor_${room.id}`
    mesh.receiveShadow = true

    const area = room.area ?? computePolygonArea(room.polygon)

    return { id: room.id, mesh, area }
  })
}
