import * as THREE from 'three'

// ─── Helpers ────────────────────────────────────────────────────────────

function color(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

function mat(hex: string, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: color(hex), roughness, metalness })
}

function box(
  w: number, h: number, d: number,
  material: THREE.MeshStandardMaterial,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function cyl(
  radiusTop: number, radiusBottom: number, height: number,
  material: THREE.MeshStandardMaterial,
  x: number, y: number, z: number,
  segments = 8,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function sphere(
  radius: number,
  material: THREE.MeshStandardMaterial,
  x: number, y: number, z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

// Color helpers
function darken(hex: string, factor = 0.7): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(factor)
  return '#' + c.getHexString()
}

function lighten(hex: string, factor = 1.3): string {
  const c = new THREE.Color(hex)
  c.r = Math.min(1, c.r * factor)
  c.g = Math.min(1, c.g * factor)
  c.b = Math.min(1, c.b * factor)
  return '#' + c.getHexString()
}

// ─── Builders ───────────────────────────────────────────────────────────

function buildSofa(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const legH = 0.08
  const legR = 0.025
  const seatH = h * 0.35
  const backH = h * 0.55
  const armW = w * 0.08
  const seatMat = mat(col)
  const frameMat = mat(darken(col, 0.6))
  const legMat = mat('#3A3A3A', 0.5, 0.2)

  // Legs
  const legPositions: [number, number][] = [
    [-w / 2 + 0.08, -d / 2 + 0.08],
    [w / 2 - 0.08, -d / 2 + 0.08],
    [-w / 2 + 0.08, d / 2 - 0.08],
    [w / 2 - 0.08, d / 2 - 0.08],
  ]
  for (const [lx, lz] of legPositions) {
    g.add(cyl(legR, legR, legH, legMat, lx, legH / 2, lz))
  }

  // Seat
  g.add(box(w, seatH, d, seatMat, 0, legH + seatH / 2, 0))

  // Backrest
  g.add(box(w, backH, 0.12, frameMat, 0, legH + seatH + backH / 2, -d / 2 + 0.06))

  // Armrests
  g.add(box(armW, seatH * 0.8, d * 0.9, frameMat, -w / 2 + armW / 2, legH + seatH * 0.4 + seatH * 0.4, 0))
  g.add(box(armW, seatH * 0.8, d * 0.9, frameMat, w / 2 - armW / 2, legH + seatH * 0.4 + seatH * 0.4, 0))

  return g
}

function buildCoffeeTable(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const topH = 0.04
  const legR = 0.025
  const legH = h - topH
  const topMat = mat(col, 0.5)
  const legMat = mat(darken(col, 0.7), 0.5, 0.1)

  g.add(box(w, topH, d, topMat, 0, legH + topH / 2, 0))

  const offsets: [number, number][] = [
    [-w / 2 + 0.06, -d / 2 + 0.06],
    [w / 2 - 0.06, -d / 2 + 0.06],
    [-w / 2 + 0.06, d / 2 - 0.06],
    [w / 2 - 0.06, d / 2 - 0.06],
  ]
  for (const [ox, oz] of offsets) {
    g.add(cyl(legR, legR, legH, legMat, ox, legH / 2, oz))
  }

  return g
}

function buildTvStand(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const cabinetH = h * 0.6
  const screenW = w * 0.85
  const screenH = h * 0.5
  const screenD = 0.04
  const cabinetMat = mat(col, 0.6)
  const screenMat = mat('#1A1A2E', 0.2, 0.0)
  const bezelMat = mat('#111111', 0.3, 0.1)

  // Cabinet
  g.add(box(w, cabinetH, d, cabinetMat, 0, cabinetH / 2, 0))

  // Cabinet shelf line
  g.add(box(w * 0.9, 0.01, d * 0.85, mat(darken(col, 0.8)), 0, cabinetH * 0.5, 0.02))

  // Screen bezel
  g.add(box(screenW, screenH, screenD, bezelMat, 0, cabinetH + screenH / 2, -d / 4))

  // Screen (slightly inset)
  g.add(box(screenW * 0.95, screenH * 0.9, 0.01, screenMat, 0, cabinetH + screenH / 2, -d / 4 + 0.02))

  return g
}

function buildBed(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const frameH = h * 0.3
  const mattressH = h * 0.35
  const headH = h * 0.55
  const pillowW = w * 0.35
  const pillowD = 0.2
  const pillowH = 0.08
  const frameMat = mat(darken(col, 0.5), 0.6)
  const mattressMat = mat(col, 0.85)
  const pillowMat = mat(lighten(col, 1.15), 0.9)

  // Frame
  g.add(box(w, frameH, d, frameMat, 0, frameH / 2, 0))

  // Mattress
  g.add(box(w * 0.96, mattressH, d * 0.95, mattressMat, 0, frameH + mattressH / 2, 0.02))

  // Headboard
  g.add(box(w, headH, 0.06, frameMat, 0, frameH / 2 + headH / 2, -d / 2 + 0.03))

  // Pillows
  g.add(box(pillowW, pillowH, pillowD, pillowMat, -w * 0.22, frameH + mattressH + pillowH / 2, -d / 2 + 0.2))
  g.add(box(pillowW, pillowH, pillowD, pillowMat, w * 0.22, frameH + mattressH + pillowH / 2, -d / 2 + 0.2))

  return g
}

function buildNightstand(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = mat(col, 0.6)
  const knobMat = mat('#C0A060', 0.3, 0.3)

  // Body
  g.add(box(w, h * 0.9, d, bodyMat, 0, h * 0.45, 0))

  // Drawer line
  g.add(box(w * 0.85, 0.005, 0.01, mat(darken(col, 0.7)), 0, h * 0.5, d / 2 + 0.005))

  // Knob
  g.add(sphere(0.015, knobMat, 0, h * 0.4, d / 2 + 0.015))

  // Top surface
  g.add(box(w * 1.02, 0.02, d * 1.02, mat(darken(col, 0.85)), 0, h * 0.92, 0))

  return g
}

function buildWardrobe(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = mat(col, 0.6)
  const handleMat = mat('#A0A0A0', 0.3, 0.4)

  // Body
  g.add(box(w, h, d, bodyMat, 0, h / 2, 0))

  // Door divider (center vertical line)
  g.add(box(0.005, h * 0.95, 0.01, mat(darken(col, 0.7)), 0, h / 2, d / 2 + 0.005))

  // Handles (2 small cylinders)
  g.add(cyl(0.012, 0.012, 0.1, handleMat, -w * 0.15, h * 0.5, d / 2 + 0.02))
  g.add(cyl(0.012, 0.012, 0.1, handleMat, w * 0.15, h * 0.5, d / 2 + 0.02))

  return g
}

function buildDiningTable(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const topH = 0.04
  const legR = 0.03
  const legH = h - topH
  const topMat = mat(col, 0.5)
  const legMat = mat(darken(col, 0.7), 0.5, 0.1)

  g.add(box(w, topH, d, topMat, 0, legH + topH / 2, 0))

  const offsets: [number, number][] = [
    [-w / 2 + 0.08, -d / 2 + 0.08],
    [w / 2 - 0.08, -d / 2 + 0.08],
    [-w / 2 + 0.08, d / 2 - 0.08],
    [w / 2 - 0.08, d / 2 - 0.08],
  ]
  for (const [ox, oz] of offsets) {
    g.add(cyl(legR, legR, legH, legMat, ox, legH / 2, oz))
  }

  return g
}

function buildDiningChair(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const seatH = h * 0.05
  const seatY = h * 0.45
  const backH = h * 0.5
  const legR = 0.02
  const seatMat = mat(col, 0.6)
  const legMat = mat(darken(col, 0.6), 0.5, 0.1)

  // Seat
  g.add(box(w, seatH, d, seatMat, 0, seatY, 0))

  // Legs
  const legOffsets: [number, number][] = [
    [-w / 2 + 0.04, -d / 2 + 0.04],
    [w / 2 - 0.04, -d / 2 + 0.04],
    [-w / 2 + 0.04, d / 2 - 0.04],
    [w / 2 - 0.04, d / 2 - 0.04],
  ]
  for (const [lx, lz] of legOffsets) {
    g.add(cyl(legR, legR, seatY, legMat, lx, seatY / 2, lz))
  }

  // Backrest
  g.add(box(w * 0.9, backH, 0.03, seatMat, 0, seatY + backH / 2, -d / 2 + 0.015))

  // Back support slats (2 vertical)
  g.add(box(0.025, backH * 0.85, 0.025, legMat, -w * 0.3, seatY + backH * 0.42, -d / 2 + 0.015))
  g.add(box(0.025, backH * 0.85, 0.025, legMat, w * 0.3, seatY + backH * 0.42, -d / 2 + 0.015))

  return g
}

function buildDesk(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const topH = 0.035
  const panelH = h - topH
  const panelW = 0.025
  const topMat = mat(col, 0.5)
  const panelMat = mat(darken(col, 0.7), 0.6)
  const drawerMat = mat(darken(col, 0.85), 0.6)

  // Tabletop
  g.add(box(w, topH, d, topMat, 0, panelH + topH / 2, 0))

  // Side panels (legs)
  g.add(box(panelW, panelH, d * 0.9, panelMat, -w / 2 + panelW / 2, panelH / 2, 0))
  g.add(box(panelW, panelH, d * 0.9, panelMat, w / 2 - panelW / 2, panelH / 2, 0))

  // Drawer unit (right side)
  const drawerW = w * 0.3
  g.add(box(drawerW, panelH * 0.9, d * 0.85, drawerMat, w / 2 - panelW - drawerW / 2, panelH * 0.45, 0.01))

  // Drawer lines
  g.add(box(drawerW * 0.9, 0.005, 0.01, mat('#555555'), w / 2 - panelW - drawerW / 2, panelH * 0.3, d * 0.44))
  g.add(box(drawerW * 0.9, 0.005, 0.01, mat('#555555'), w / 2 - panelW - drawerW / 2, panelH * 0.6, d * 0.44))

  // Drawer knobs
  const knobMat = mat('#999999', 0.3, 0.4)
  g.add(sphere(0.012, knobMat, w / 2 - panelW - drawerW / 2, panelH * 0.3, d * 0.46))
  g.add(sphere(0.012, knobMat, w / 2 - panelW - drawerW / 2, panelH * 0.6, d * 0.46))

  return g
}

function buildBookshelf(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const sideW = 0.02
  const shelfCount = 4
  const shelfH = 0.02
  const bodyMat = mat(col, 0.6)
  const bookColors = ['#8B4513', '#2F4F4F', '#8B0000', '#4A4A6A', '#6B8E23', '#CD853F']

  // Side panels
  g.add(box(sideW, h, d, bodyMat, -w / 2 + sideW / 2, h / 2, 0))
  g.add(box(sideW, h, d, bodyMat, w / 2 - sideW / 2, h / 2, 0))

  // Back panel
  g.add(box(w, h, 0.01, mat(darken(col, 0.85)), 0, h / 2, -d / 2 + 0.005))

  // Shelves
  for (let i = 0; i <= shelfCount; i++) {
    const sy = (i / shelfCount) * h
    g.add(box(w - sideW * 2, shelfH, d, bodyMat, 0, sy + shelfH / 2, 0))
  }

  // Books (small colored boxes on shelves)
  const bookSeed = 42
  let seed = bookSeed
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

  for (let i = 0; i < shelfCount; i++) {
    const shelfY = ((i + 1) / shelfCount) * h
    const sectionH = h / shelfCount
    const bookH = sectionH * 0.7
    let bx = -w / 2 + sideW + 0.03
    while (bx < w / 2 - sideW - 0.03) {
      const bw = 0.02 + rand() * 0.03
      const bColor = bookColors[Math.floor(rand() * bookColors.length)]
      g.add(box(bw, bookH, d * 0.8, mat(bColor, 0.8), bx + bw / 2, shelfY + shelfH + bookH / 2, 0.01))
      bx += bw + 0.005
    }
  }

  return g
}

function buildBathroomSink(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const cabinetH = h * 0.6
  const basinH = h * 0.15
  const cabinetMat = mat(darken(col, 0.85), 0.6)
  const basinMat = mat(col, 0.2, 0.0)
  const faucetMat = mat('#C0C0C0', 0.3, 0.5)

  // Cabinet
  g.add(box(w, cabinetH, d, cabinetMat, 0, cabinetH / 2, 0))

  // Basin
  g.add(box(w * 0.7, basinH, d * 0.6, basinMat, 0, cabinetH + basinH / 2, -d * 0.05))

  // Faucet
  g.add(cyl(0.015, 0.015, 0.15, faucetMat, 0, cabinetH + basinH + 0.075, -d * 0.25))
  g.add(cyl(0.01, 0.01, 0.08, faucetMat, 0, cabinetH + basinH + 0.15, -d * 0.2, 6))

  return g
}

function buildToilet(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const tankH = h * 0.45
  const tankD = d * 0.35
  const bowlH = h * 0.4
  const ceramicMat = mat(col, 0.15, 0.0)

  // Tank
  g.add(box(w * 0.85, tankH, tankD, ceramicMat, 0, h - tankH / 2, -d / 2 + tankD / 2))

  // Tank lid (slightly wider)
  g.add(box(w * 0.9, 0.03, tankD * 1.05, mat(lighten(col, 1.05), 0.1), 0, h - 0.015, -d / 2 + tankD / 2))

  // Bowl (cylinder)
  g.add(cyl(w * 0.4, w * 0.45, bowlH, ceramicMat, 0, bowlH / 2, d * 0.1, 12))

  // Seat ring (torus-like, thin cylinder)
  g.add(cyl(w * 0.38, w * 0.38, 0.02, mat('#EEEEEE', 0.3), 0, bowlH + 0.01, d * 0.1, 16))

  return g
}

function buildShower(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const trayH = 0.05
  const glassThick = 0.015
  const trayMat = mat('#E0E0E0', 0.3)
  const glassMat = new THREE.MeshStandardMaterial({
    color: color(col),
    roughness: 0.05,
    metalness: 0.0,
    transparent: true,
    opacity: 0.25,
  })
  const frameMat = mat('#C0C0C0', 0.3, 0.4)

  // Base tray
  g.add(box(w, trayH, d, trayMat, 0, trayH / 2, 0))

  // Back wall panel
  g.add(box(w, h - trayH, glassThick, glassMat, 0, trayH + (h - trayH) / 2, -d / 2 + glassThick / 2))

  // Side wall panel
  g.add(box(glassThick, h - trayH, d, glassMat, -w / 2 + glassThick / 2, trayH + (h - trayH) / 2, 0))

  // Front panel (partial)
  g.add(box(glassThick, h - trayH, d * 0.6, glassMat, w / 2 - glassThick / 2, trayH + (h - trayH) / 2, d * 0.2))

  // Shower head pole
  g.add(cyl(0.012, 0.012, h * 0.7, frameMat, -w / 2 + 0.1, trayH + h * 0.35, -d / 2 + 0.1))

  // Shower head
  g.add(cyl(0.06, 0.05, 0.03, frameMat, -w / 2 + 0.1, trayH + h * 0.72, -d / 2 + 0.1, 12))

  return g
}

function buildKitchenCounter(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const counterH = h * 0.05
  const cabinetH = h - counterH
  const cabinetMat = mat(col, 0.6)
  const counterMat = mat('#E8E0D8', 0.3, 0.05)
  const handleMat = mat('#A0A0A0', 0.3, 0.4)

  // Base cabinet
  g.add(box(w, cabinetH, d, cabinetMat, 0, cabinetH / 2, 0))

  // Cabinet doors (lines)
  const doorCount = Math.floor(w / 0.5)
  const doorW = w / doorCount
  for (let i = 0; i < doorCount; i++) {
    const dx = -w / 2 + doorW * (i + 0.5)
    g.add(box(doorW * 0.9, cabinetH * 0.9, 0.01, mat(darken(col, 0.85)), dx, cabinetH * 0.5, d / 2 + 0.005))
    // Handle
    g.add(cyl(0.008, 0.008, 0.06, handleMat, dx, cabinetH * 0.65, d / 2 + 0.02))
  }

  // Countertop
  g.add(box(w + 0.02, counterH, d + 0.02, counterMat, 0, cabinetH + counterH / 2, 0))

  return g
}

function buildFridge(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const bodyMat = mat(col, 0.3, 0.2)
  const handleMat = mat('#A0A0A0', 0.3, 0.5)

  // Body
  g.add(box(w, h, d, bodyMat, 0, h / 2, 0))

  // Door divider line
  g.add(box(w * 0.98, 0.005, 0.01, mat(darken(col, 0.7)), 0, h * 0.4, d / 2 + 0.005))

  // Top door handle
  g.add(cyl(0.012, 0.012, 0.2, handleMat, w * 0.35, h * 0.7, d / 2 + 0.025))

  // Bottom door handle
  g.add(cyl(0.012, 0.012, 0.2, handleMat, w * 0.35, h * 0.2, d / 2 + 0.025))

  return g
}

// ─── Dispatch ───────────────────────────────────────────────────────────

type Builder = (w: number, h: number, d: number, col: string) => THREE.Group

const builders: Record<string, Builder> = {
  sofa: buildSofa,
  coffee_table: buildCoffeeTable,
  tv_stand: buildTvStand,
  bed: buildBed,
  nightstand: buildNightstand,
  wardrobe: buildWardrobe,
  dining_table: buildDiningTable,
  dining_chair: buildDiningChair,
  desk: buildDesk,
  bookshelf: buildBookshelf,
  bathroom_sink: buildBathroomSink,
  toilet: buildToilet,
  shower: buildShower,
  kitchen_counter: buildKitchenCounter,
  fridge: buildFridge,
}

function buildFallback(w: number, h: number, d: number, col: string): THREE.Group {
  const g = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(col), roughness: 0.7, metalness: 0.0 }),
  )
  mesh.position.y = h / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  g.add(mesh)
  return g
}

export function createFurnitureModel(category: string, size: [number, number, number], color: string): THREE.Group {
  const builder = builders[category] || buildFallback
  return builder(size[0], size[1], size[2], color)
}
