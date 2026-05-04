import * as THREE from 'three'
import type { Room, Opening, SceneObject, Vec2, Vec3 } from '@/types/scene'
import { furnitureCatalog, type FurnitureDef } from '@/data/furnitureCatalog'
import { roomFurnitureMap, type PlacementZone } from '@/data/furnitureLayout'

export interface BuiltObject {
  id: string
  mesh: THREE.Group
  sceneObject: SceneObject
}

interface RoomBBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  cx: number
  cz: number
  width: number
  depth: number
}

interface PlacedBox {
  x: number
  z: number
  hw: number // half-width
  hd: number // half-depth
}

function computeBBox(polygon: Vec2[]): RoomBBox {
  const xs = polygon.map((p) => p[0])
  const zs = polygon.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    width: maxX - minX,
    depth: maxZ - minZ,
  }
}

function getDoorExclusions(openings: Opening[], bbox: RoomBBox): Vec2[] {
  const exclusions: Vec2[] = []
  const margin = 0.8
  for (const op of openings) {
    if (op.type !== 'door') continue
    const [px, pz] = op.position
    if (px >= bbox.minX - margin && px <= bbox.maxX + margin &&
        pz >= bbox.minZ - margin && pz <= bbox.maxZ + margin) {
      exclusions.push(op.position)
    }
  }
  return exclusions
}

function isNearDoor(x: number, z: number, doors: Vec2[], radius: number): boolean {
  for (const [dx, dz] of doors) {
    const dist = Math.sqrt((x - dx) ** 2 + (z - dz) ** 2)
    if (dist < radius) return true
  }
  return false
}

function aabbOverlap(a: PlacedBox, b: PlacedBox): boolean {
  return (
    Math.abs(a.x - b.x) < a.hw + b.hw &&
    Math.abs(a.z - b.z) < a.hd + b.hd
  )
}

function resolvePosition(
  x: number,
  z: number,
  hw: number,
  hd: number,
  placed: PlacedBox[],
  doors: Vec2[],
  bbox: RoomBBox,
): [number, number] | null {
  // Clamp to room bounds
  const cx = Math.max(bbox.minX + hw, Math.min(bbox.maxX - hw, x))
  const cz = Math.max(bbox.minZ + hd, Math.min(bbox.maxZ - hd, z))

  if (cx - hw < bbox.minX || cx + hw > bbox.maxX || cz - hd < bbox.minZ || cz + hd > bbox.maxZ) {
    return null
  }

  if (isNearDoor(cx, cz, doors, 0.8)) {
    return null
  }

  const box: PlacedBox = { x: cx, z: cz, hw, hd }
  for (const p of placed) {
    if (aabbOverlap(box, p)) {
      return null
    }
  }

  return [cx, cz]
}

function getZonePosition(
  zone: PlacementZone,
  bbox: RoomBBox,
  def: FurnitureDef,
  tablePos?: [number, number],
  tableSize?: Vec3,
): [number, number] {
  const hw = def.size[0] / 2
  const hd = def.size[2] / 2
  const inset = 0.15

  switch (zone) {
    case 'wall_south':
      return [bbox.cx, bbox.maxZ - hd - inset]
    case 'wall_north':
      return [bbox.cx, bbox.minZ + hd + inset]
    case 'wall_left':
      return [bbox.minX + hw + inset, bbox.cz]
    case 'wall_right':
      return [bbox.maxX - hw - inset, bbox.cz]
    case 'center':
      return [bbox.cx, bbox.cz]
    case 'corner':
      return [bbox.maxX - hw - inset, bbox.maxZ - hd - inset]
    case 'around_table': {
      if (!tablePos || !tableSize) return [bbox.cx, bbox.cz]
      return [tablePos[0], tablePos[1]] // placeholder, handled specially
    }
    default:
      return [bbox.cx, bbox.cz]
  }
}

function createFurnitureMesh(def: FurnitureDef): THREE.Group {
  const group = new THREE.Group()
  const [w, h, d] = def.size

  const geometry = new THREE.BoxGeometry(w, h, d)
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color),
    roughness: 0.7,
    metalness: 0.0,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = h / 2
  mesh.castShadow = true
  mesh.receiveShadow = true

  group.add(mesh)
  return group
}

let objectCounter = 0

export function buildObjects(
  rooms: Room[],
  openings: Opening[],
): BuiltObject[] {
  objectCounter = 0
  const result: BuiltObject[] = []

  for (const room of rooms) {
    const placements = roomFurnitureMap[room.type]
    if (!placements || placements.length === 0) continue

    const bbox = computeBBox(room.polygon)
    const doors = getDoorExclusions(openings, bbox)
    const placed: PlacedBox[] = []
    let tablePos: [number, number] | undefined
    let tableDef: FurnitureDef | undefined

    for (const placement of placements) {
      const def = furnitureCatalog[placement.category]
      if (!def) continue

      const hw = def.size[0] / 2
      const hd = def.size[2] / 2

      if (placement.placement === 'around_table' && tablePos && tableDef) {
        // Place chairs around the table
        const [tx, tz] = tablePos
        const tw = tableDef.size[0] / 2
        const td = tableDef.size[2] / 2
        const gap = 0.3

        const chairPositions: [number, number, number][] = [
          [tx, tz - td - hd - gap, 0],
          [tx, tz + td + hd + gap, Math.PI],
          [tx - tw - hw - gap, tz, Math.PI / 2],
          [tx + tw + hw + gap, tz, -Math.PI / 2],
        ]

        for (let i = 0; i < Math.min(placement.count, chairPositions.length); i++) {
          const [cx, cz, rot] = chairPositions[i]
          const resolved = resolvePosition(cx, cz, hw, hd, placed, doors, bbox)
          if (!resolved) continue

          objectCounter++
          const id = `obj_${room.id}_${placement.category}_${objectCounter}`
          const mesh = createFurnitureMesh(def)
          mesh.position.set(resolved[0], 0, resolved[1])
          mesh.rotation.y = rot

          const sceneObj: SceneObject = {
            id,
            type: 'furniture',
            category: placement.category,
            room_ref: room.id,
            position: [resolved[0], 0, resolved[1]],
            rotation: [0, rot, 0],
            scale: [1, 1, 1],
            size: def.size,
          }

          placed.push({ x: resolved[0], z: resolved[1], hw, hd })
          result.push({ id, mesh, sceneObject: sceneObj })
        }
        continue
      }

      const basePos = getZonePosition(placement.placement, bbox, def, tablePos, tableDef?.size)
      const resolved = resolvePosition(basePos[0], basePos[1], hw, hd, placed, doors, bbox)
      if (!resolved) continue

      const rot = placement.rotation

      objectCounter++
      const id = `obj_${room.id}_${placement.category}_${objectCounter}`
      const mesh = createFurnitureMesh(def)
      mesh.position.set(resolved[0], 0, resolved[1])
      mesh.rotation.y = rot

      const sceneObj: SceneObject = {
        id,
        type: 'furniture',
        category: placement.category,
        room_ref: room.id,
        position: [resolved[0], 0, resolved[1]],
        rotation: [0, rot, 0],
        scale: [1, 1, 1],
        size: def.size,
      }

      placed.push({ x: resolved[0], z: resolved[1], hw, hd })
      result.push({ id, mesh, sceneObject: sceneObj })

      // Track dining table position for chair placement
      if (placement.category === 'dining_table') {
        tablePos = resolved
        tableDef = def
      }
    }
  }

  return result
}
