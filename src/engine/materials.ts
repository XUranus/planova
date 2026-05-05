import * as THREE from 'three'
import type { SceneMaterial } from '@/types/scene'
import { getTexture } from './proceduralTextures'

const DEFAULT_WALL_COLOR = '#E8E4DF'
const DEFAULT_FLOOR_COLOR = '#D9D2C5'
const DEFAULT_CEILING_COLOR = '#FFFFFF'
const DEFAULT_DOOR_COLOR = '#8B6F47'
const DEFAULT_WINDOW_COLOR = '#B5D4E8'

const materialCache = new Map<string, THREE.Material>()

function hexToColor(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

/**
 * Apply a procedural texture to a material if the texture_url uses the texture:// scheme.
 * Returns true if a texture was applied.
 */
function applyTextureIfPresent(
  mat: THREE.MeshStandardMaterial,
  textureUrl?: string,
): boolean {
  if (!textureUrl || !textureUrl.startsWith('texture://')) return false
  const presetId = textureUrl.replace('texture://', '')
  const tex = getTexture(presetId)
  if (!tex) return false
  mat.map = tex
  return true
}

export function getMaterial(sceneMat?: SceneMaterial): THREE.MeshStandardMaterial {
  const key = sceneMat?.id || 'default_wall'
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(sceneMat?.base_color || DEFAULT_WALL_COLOR),
    roughness: sceneMat?.roughness ?? 0.8,
    metalness: sceneMat?.metalness ?? 0.0,
    side: THREE.DoubleSide,
  })

  if (sceneMat?.transparent) {
    mat.transparent = true
    mat.opacity = sceneMat.opacity ?? 0.4
  }

  applyTextureIfPresent(mat, sceneMat?.texture_urls?.base_color)

  materialCache.set(key, mat)
  return mat
}

export function getMaterialById(
  materials: SceneMaterial[],
  id: string,
): THREE.MeshStandardMaterial | null {
  const found = materials.find((m) => m.id === id)
  if (!found) return null
  return getMaterial(found)
}

export function createWallMaterial(textureId?: string): THREE.MeshStandardMaterial {
  const key = textureId ? `wall_default_${textureId}` : 'wall_default'
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(DEFAULT_WALL_COLOR),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  if (textureId) {
    applyTextureIfPresent(mat, `texture://${textureId}`)
  }

  materialCache.set(key, mat)
  return mat
}

export function createFloorMaterial(color?: string, textureId?: string): THREE.MeshStandardMaterial {
  const key = `floor_${color || DEFAULT_FLOOR_COLOR}_${textureId || ''}`
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(color || DEFAULT_FLOOR_COLOR),
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  if (textureId) {
    applyTextureIfPresent(mat, `texture://${textureId}`)
  }

  materialCache.set(key, mat)
  return mat
}

export function createCeilingMaterial(textureId?: string): THREE.MeshStandardMaterial {
  const key = textureId ? `ceiling_default_${textureId}` : 'ceiling_default'
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(DEFAULT_CEILING_COLOR),
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  if (textureId) {
    applyTextureIfPresent(mat, `texture://${textureId}`)
  }

  materialCache.set(key, mat)
  return mat
}

export function createDoorMaterial(): THREE.MeshStandardMaterial {
  const key = 'door_default'
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(DEFAULT_DOOR_COLOR),
    roughness: 0.6,
    metalness: 0.1,
  })
  materialCache.set(key, mat)
  return mat
}

export function createWindowMaterial(): THREE.MeshStandardMaterial {
  const key = 'window_default'
  const cached = materialCache.get(key)
  if (cached) return cached as THREE.MeshStandardMaterial

  const mat = new THREE.MeshStandardMaterial({
    color: hexToColor(DEFAULT_WINDOW_COLOR),
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.4,
  })
  materialCache.set(key, mat)
  return mat
}

export function clearMaterialCache(): void {
  materialCache.forEach((mat) => mat.dispose())
  materialCache.clear()
}
