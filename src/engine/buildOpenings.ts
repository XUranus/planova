import * as THREE from 'three'
import type { Opening, Wall, DoorSwing } from '@/types/scene'
import { wallNormal } from './geometryUtils'

export interface BuiltOpening {
  id: string
  mesh: THREE.Group
  type: 'door' | 'window'
}

// ─── Helpers ────────────────────────────────────────────────────────────

function box(
  w: number, h: number, d: number,
  material: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// ─── Door builder ───────────────────────────────────────────────────────

function buildDoorModel(width: number, height: number, swing?: DoorSwing): THREE.Group {
  const g = new THREE.Group()
  const frameW = 0.04 // frame strip width
  const frameD = 0.06 // frame depth (protrudes from wall)
  const panelThick = 0.03

  const frameColor = '#6B5040'
  const panelColor = '#8B6F47'
  const handleColor = '#C0A060'

  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.6, metalness: 0.1 })
  const panelMat = new THREE.MeshStandardMaterial({ color: panelColor, roughness: 0.5, metalness: 0.05 })
  const handleMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.3, metalness: 0.4 })

  const innerW = width - frameW * 2
  const innerH = height - frameW

  // Left frame strip
  g.add(box(frameW, height, frameD, frameMat, -width / 2 + frameW / 2, height / 2, 0))
  // Right frame strip
  g.add(box(frameW, height, frameD, frameMat, width / 2 - frameW / 2, height / 2, 0))
  // Top frame strip
  g.add(box(innerW, frameW, frameD, frameMat, 0, height - frameW / 2, 0))
  // Threshold (bottom)
  g.add(box(width, frameW * 0.6, frameD, frameMat, 0, frameW * 0.3, 0))

  // Door panel (inset slightly)
  const panelX = swing?.includes('right') ? innerW / 2 * 0.02 : -innerW / 2 * 0.02
  g.add(box(innerW * 0.95, innerH * 0.97, panelThick, panelMat, panelX, frameW + innerH / 2, 0))

  // Door handle
  const handleSide = swing?.includes('right') ? 1 : -1
  const handleX = handleSide * (innerW * 0.35)
  const handleY = height * 0.45
  g.add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.06, 6),
    handleMat,
  ))
  const handleMesh = g.children[g.children.length - 1]
  handleMesh.position.set(handleX, handleY, panelThick / 2 + 0.015)
  handleMesh.rotation.x = Math.PI / 2
  handleMesh.castShadow = true

  return g
}

// ─── Window builder ─────────────────────────────────────────────────────

function buildWindowModel(width: number, height: number): THREE.Group {
  const g = new THREE.Group()
  const frameW = 0.035
  const frameD = 0.04
  const glassThick = 0.008

  const frameColor = '#FFFFFF'
  const mullionColor = '#E8E8E8'

  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.4, metalness: 0.05 })
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#B5D4E8',
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
  })
  const mullionMat = new THREE.MeshStandardMaterial({ color: mullionColor, roughness: 0.4, metalness: 0.05 })

  const innerW = width - frameW * 2
  const innerH = height - frameW * 2

  // Left frame strip
  g.add(box(frameW, height, frameD, frameMat, -width / 2 + frameW / 2, height / 2, 0))
  // Right frame strip
  g.add(box(frameW, height, frameD, frameMat, width / 2 - frameW / 2, height / 2, 0))
  // Top frame strip
  g.add(box(innerW, frameW, frameD, frameMat, 0, height - frameW / 2, 0))
  // Bottom frame strip (sill)
  g.add(box(innerW, frameW * 1.2, frameD, frameMat, 0, frameW * 0.6, 0))

  // Glass pane
  g.add(box(innerW * 0.96, innerH * 0.96, glassThick, glassMat, 0, frameW + innerH / 2, 0))

  // Horizontal mullion (center)
  g.add(box(innerW * 0.96, frameW * 0.5, glassThick + 0.005, mullionMat, 0, height / 2, 0))

  // Vertical mullion (center)
  g.add(box(frameW * 0.5, innerH * 0.96, glassThick + 0.005, mullionMat, 0, frameW + innerH / 2, 0))

  return g
}

// ─── Main builder ───────────────────────────────────────────────────────

export function buildOpenings(
  openings: Opening[],
  walls: Wall[]
): BuiltOpening[] {
  const wallMap = new Map(walls.map((w) => [w.id, w]))

  return openings.map((opening) => {
    const wall = wallMap.get(opening.wall_ref)

    let group: THREE.Group

    if (opening.type === 'door') {
      group = buildDoorModel(opening.width, opening.height, opening.swing)
    } else {
      group = buildWindowModel(opening.width, opening.height)
    }

    group.name = opening.id

    if (!wall) {
      group.position.set(opening.position[0], opening.sill_height, opening.position[1])
      return { id: opening.id, mesh: group, type: opening.type }
    }

    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const angle = Math.atan2(dz, dx)
    const normal = wallNormal(wall.start, wall.end)

    // Offset slightly outward from wall center
    const offsetX = normal[0] * (wall.thickness / 2 + 0.01)
    const offsetZ = normal[1] * (wall.thickness / 2 + 0.01)

    group.position.set(
      opening.position[0] + offsetX,
      opening.sill_height,
      opening.position[1] + offsetZ,
    )
    group.rotation.y = -angle

    return { id: opening.id, mesh: group, type: opening.type }
  })
}
