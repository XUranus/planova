import * as THREE from 'three'
import type { Wall, SceneMaterial } from '@/types/scene'
import { createWallGeometry } from './geometryUtils'
import { createWallMaterial, getMaterialById } from './materials'
import { createShaderMaterial, isShaderPreset } from './shaderMaterials'

export interface BuiltWall {
  id: string
  mesh: THREE.Mesh
}

export function buildWalls(walls: Wall[], materials: SceneMaterial[] = [], textureOverride?: string): BuiltWall[] {
  return walls.map((wall) => {
    const geometry = createWallGeometry(wall)

    let material: THREE.MeshStandardMaterial
    if (wall.material) {
      const found = getMaterialById(materials, wall.material)
      material = found ?? (textureOverride && isShaderPreset(textureOverride)
        ? createShaderMaterial(textureOverride)!
        : createWallMaterial(textureOverride))
    } else if (textureOverride && isShaderPreset(textureOverride)) {
      material = createShaderMaterial(textureOverride)!
    } else {
      material = createWallMaterial(textureOverride)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = wall.id
    mesh.castShadow = true
    mesh.receiveShadow = true

    return { id: wall.id, mesh }
  })
}
