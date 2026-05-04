import * as THREE from 'three'
import type { Vec2, Wall } from '@/types/scene'

/**
 * Compute the 2D perpendicular (normal) of a direction vector in XZ plane.
 * Returns a unit vector perpendicular to (dx, dz).
 */
export function perpendicular2D(dx: number, dz: number): [number, number] {
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len < 1e-8) return [0, 1]
  // Rotate 90 degrees: (dx, dz) -> (-dz, dx)
  return [-dz / len, dx / len]
}

/**
 * Compute wall normal from start/end points.
 */
export function wallNormal(start: Vec2, end: Vec2): [number, number] {
  return perpendicular2D(end[0] - start[0], end[1] - start[1])
}

/**
 * Create a box geometry for a wall.
 * The wall extends from start to end, with the given thickness and height.
 * Returns geometry centered at the wall's midpoint, at y = height/2.
 */
export function createWallGeometry(wall: Wall): THREE.BufferGeometry {
  const { start, end, height, thickness } = wall

  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const length = Math.sqrt(dx * dx + dz * dz)

  if (length < 1e-8) {
    return new THREE.BoxGeometry(thickness, height, thickness)
  }

  const geo = new THREE.BoxGeometry(length, height, thickness)

  // Compute the angle in XZ plane
  const angle = Math.atan2(dz, dx)

  // Rotate the geometry to align with the wall direction
  // BoxGeometry is along X-axis by default, we rotate around Y
  geo.rotateY(-angle)

  // Translate to wall midpoint
  const midX = (start[0] + end[0]) / 2
  const midZ = (start[1] + end[1]) / 2
  geo.translate(midX, height / 2, midZ)

  return geo
}

/**
 * Convert a 2D polygon to a THREE.Shape for floor/ceiling rendering.
 * The polygon is in [x, z] format. The shape is created in the XZ plane
 * (Three.js Shape is 2D in XY, so we map x->x, z->-y and rotate later).
 */
export function polygonToShape(polygon: Vec2[]): THREE.Shape {
  if (polygon.length < 3) {
    return new THREE.Shape()
  }

  // Use x directly, negate z for shape coordinate (will rotate back later)
  const shape = new THREE.Shape()
  shape.moveTo(polygon[0][0], polygon[0][1])
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i][0], polygon[i][1])
  }
  shape.closePath()

  return shape
}

/**
 * Create a floor/ceiling mesh geometry from a room polygon.
 * Returns geometry in XZ plane at y=0. Caller should translate to correct Y.
 */
export function createPolygonGeometry(polygon: Vec2[]): THREE.BufferGeometry {
  const shape = polygonToShape(polygon)
  const geo = new THREE.ShapeGeometry(shape)
  // Rotate from XY plane to XZ plane: rotate -PI/2 around X
  geo.rotateX(-Math.PI / 2)
  return geo
}

/**
 * Compute the area of a 2D polygon using the Shoelace formula.
 */
export function computePolygonArea(polygon: Vec2[]): number {
  let area = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += polygon[i][0] * polygon[j][1]
    area -= polygon[j][0] * polygon[i][1]
  }
  return Math.abs(area) / 2
}

/**
 * Create a simple door placeholder geometry (a box).
 */
export function createDoorGeometry(width: number, height: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, 0.08)
}

/**
 * Create a simple window placeholder geometry (a thin box).
 */
export function createWindowGeometry(width: number, height: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, 0.04)
}

/**
 * Compute the position and angle of an opening on a wall.
 * Returns { position: Vec3, angle: number } where position is in world space
 * and angle is the Y-rotation matching the wall direction.
 */
export function computeOpeningTransform(
  wall: Wall,
  openingPos: Vec2
): { position: THREE.Vector3; angle: number } {
  const { start, end, height } = wall
  const dx = end[0] - start[0]
  const dz = end[1] - start[1]
  const angle = Math.atan2(dz, dx)

  return {
    position: new THREE.Vector3(openingPos[0], height / 2, openingPos[1]),
    angle,
  }
}
