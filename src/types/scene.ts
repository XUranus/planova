/**
 * Home Scene JSON — the unified data protocol for Planova.
 * Links floor plan parsing, AI planning, 3D generation, rendering, and export.
 * Matches PRD §7.
 */

export type RoomType =
  | 'living_room'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining_room'
  | 'balcony'
  | 'corridor'
  | 'study'

export type OpeningType = 'door' | 'window'

export type DoorSwing =
  | 'left_inward'
  | 'left_outward'
  | 'right_inward'
  | 'right_outward'

export type LightType = 'area' | 'point' | 'spot' | 'directional'

export type CameraType = 'perspective' | 'orthographic'

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

export interface HomeSceneProject {
  id: string
  name: string
  unit: 'meter'
}

export interface HomeSceneGlobal {
  style: string
  ceiling_height: number
  wall_thickness: number
  texture_overrides?: {
    floor?: string
    wall?: string
    ceiling?: string
  }
}

export interface Room {
  id: string
  type: RoomType
  name: string
  polygon: Vec2[]
  area?: number
  floor_material?: string
  wall_material?: string
  ceiling_material?: string
}

export interface Wall {
  id: string
  start: Vec2
  end: Vec2
  height: number
  thickness: number
  material?: string
  room_refs: string[]
}

export interface Opening {
  id: string
  type: OpeningType
  wall_ref: string
  position: Vec2
  width: number
  height: number
  sill_height: number
  swing?: DoorSwing
}

export interface SceneObject {
  id: string
  type: 'furniture' | 'decoration'
  category: string
  asset_id?: string
  room_ref?: string
  position: Vec3
  rotation: Vec3
  scale: Vec3
  size: Vec3
  material_overrides?: Record<string, string>
}

export interface SceneMaterial {
  id: string
  type: 'pbr'
  name: string
  base_color: string
  roughness: number
  metalness: number
  transparent?: boolean
  opacity?: number
  texture_urls?: {
    base_color?: string
    normal?: string
    roughness?: string
  }
}

export interface SceneLight {
  id: string
  type: LightType
  name: string
  position: Vec3
  rotation: Vec3
  intensity: number
  color: string
  size?: Vec2
}

export interface CameraPreset {
  id: string
  name: string
  type: CameraType
  position: Vec3
  target: Vec3
  fov: number
}

export interface HomeSceneJSON {
  schema_version: string
  project: HomeSceneProject
  global: HomeSceneGlobal
  rooms: Room[]
  walls: Wall[]
  openings: Opening[]
  objects: SceneObject[]
  materials: SceneMaterial[]
  lights: SceneLight[]
  cameras: CameraPreset[]
}
