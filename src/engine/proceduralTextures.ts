import * as THREE from 'three'

export interface TexturePreset {
  id: string
  name: string
  category: 'floor' | 'wall' | 'ceiling'
  /** Generate a tileable texture canvas. Size should be power of 2 (e.g. 256, 512). */
  generate: (size: number) => HTMLCanvasElement
}

// ─── Seeded RNG for deterministic noise ─────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function createCanvas(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  return ctx
}

/** Add pixel-level noise to the current canvas content. */
function addNoise(ctx: CanvasRenderingContext2D, intensity: number, seed = 42): void {
  const { width, height } = ctx.canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const rand = seededRandom(seed)
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rand() - 0.5) * intensity * 255
    data[i] = Math.max(0, Math.min(255, data[i] + noise))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
  }
  ctx.putImageData(imageData, 0, 0)
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

// ─── Floor Presets ──────────────────────────────────────────────────────

function generateOakPlank(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(100)

  // Base wood color
  ctx.fillStyle = '#B8935A'
  ctx.fillRect(0, 0, size, size)

  // Draw planks (horizontal)
  const plankHeight = size / 8
  for (let row = 0; row < 8; row++) {
    const y = row * plankHeight
    const offset = row % 2 === 0 ? 0 : size / 3 // stagger joints

    // Plank base with slight color variation
    const brightness = 0.9 + rand() * 0.2
    const [r, g, b] = hexToRgb('#B8935A')
    ctx.fillStyle = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`
    ctx.fillRect(0, y, size, plankHeight - 1)

    // Wood grain lines
    ctx.strokeStyle = `rgba(80, 50, 20, ${0.1 + rand() * 0.1})`
    ctx.lineWidth = 0.5
    for (let i = 0; i < 6; i++) {
      const gy = y + rand() * plankHeight
      ctx.beginPath()
      ctx.moveTo(0, gy)
      for (let x = 0; x < size; x += 4) {
        ctx.lineTo(x, gy + Math.sin(x * 0.05 + rand() * 2) * 1.5)
      }
      ctx.stroke()
    }

    // Plank joint (dark line between rows)
    ctx.fillStyle = '#6B4F3A'
    ctx.fillRect(0, y + plankHeight - 1, size, 1)

    // Vertical joint (staggered)
    if (offset > 0) {
      ctx.fillStyle = '#6B4F3A'
      ctx.fillRect(offset, y, 1, plankHeight)
    }
  }

  addNoise(ctx, 0.04, 101)
  return ctx.canvas
}

function generateMarbleTile(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(200)

  // Base white
  ctx.fillStyle = '#F0EDE8'
  ctx.fillRect(0, 0, size, size)

  // Veins
  for (let v = 0; v < 8; v++) {
    ctx.strokeStyle = `rgba(180, 170, 160, ${0.2 + rand() * 0.3})`
    ctx.lineWidth = 0.5 + rand() * 1.5
    ctx.beginPath()
    let x = rand() * size
    let y = rand() * size
    ctx.moveTo(x, y)
    for (let s = 0; s < 30; s++) {
      x += (rand() - 0.5) * 20
      y += (rand() - 0.3) * 15
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // Fine veins
  for (let v = 0; v < 15; v++) {
    ctx.strokeStyle = `rgba(160, 155, 145, ${0.1 + rand() * 0.15})`
    ctx.lineWidth = 0.3
    ctx.beginPath()
    let x = rand() * size
    let y = rand() * size
    ctx.moveTo(x, y)
    for (let s = 0; s < 15; s++) {
      x += (rand() - 0.5) * 12
      y += (rand() - 0.4) * 10
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // Tile grout grid (4x4 tiles)
  const tileSize4 = size / 4
  ctx.strokeStyle = '#C8C0B8'
  ctx.lineWidth = 1.5
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(i * tileSize4, 0)
    ctx.lineTo(i * tileSize4, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * tileSize4)
    ctx.lineTo(size, i * tileSize4)
    ctx.stroke()
  }

  addNoise(ctx, 0.03, 201)
  return ctx.canvas
}

function generateConcrete(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  // Base gray
  ctx.fillStyle = '#B0AAA5'
  ctx.fillRect(0, 0, size, size)

  // Heavy noise for concrete texture
  addNoise(ctx, 0.08, 300)

  // Darker speckles
  const rand = seededRandom(301)
  for (let i = 0; i < 200; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 2
    ctx.fillStyle = `rgba(80, 75, 70, ${0.1 + rand() * 0.15})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Lighter speckles
  for (let i = 0; i < 100; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 0.5 + rand() * 1.5
    ctx.fillStyle = `rgba(200, 195, 190, ${0.1 + rand() * 0.1})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return ctx.canvas
}

function generateHerringbone(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(400)

  const stripWidth = size / 16
  const stripLength = size / 4

  // Background
  ctx.fillStyle = '#C4A882'
  ctx.fillRect(0, 0, size, size)

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = col * stripLength
      const cy = row * stripLength

      // Alternating direction
      const horizontal = (row + col) % 2 === 0

      for (let i = 0; i < 4; i++) {
        const brightness = 0.85 + rand() * 0.3
        const [r, g, b] = hexToRgb('#B8956A')
        ctx.fillStyle = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`

        if (horizontal) {
          const x = cx + i * stripWidth
          ctx.fillRect(x, cy, stripWidth - 0.5, stripLength)
          // Grain
          ctx.strokeStyle = `rgba(100, 70, 40, 0.08)`
          ctx.lineWidth = 0.5
          for (let g2 = 0; g2 < 3; g2++) {
            const gy = cy + rand() * stripLength
            ctx.beginPath()
            ctx.moveTo(x, gy)
            ctx.lineTo(x + stripWidth, gy + (rand() - 0.5) * 2)
            ctx.stroke()
          }
        } else {
          const y = cy + i * stripWidth
          ctx.fillRect(cx, y, stripLength, stripWidth - 0.5)
          ctx.strokeStyle = `rgba(100, 70, 40, 0.08)`
          ctx.lineWidth = 0.5
          for (let g2 = 0; g2 < 3; g2++) {
            const gx = cx + rand() * stripLength
            ctx.beginPath()
            ctx.moveTo(gx, y)
            ctx.lineTo(gx + (rand() - 0.5) * 2, y + stripWidth)
            ctx.stroke()
          }
        }
      }
    }
  }

  addNoise(ctx, 0.03, 401)
  return ctx.canvas
}

// ─── Wall Presets ───────────────────────────────────────────────────────

function generateWhitePlaster(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  ctx.fillStyle = '#F2EFEA'
  ctx.fillRect(0, 0, size, size)

  addNoise(ctx, 0.035, 500)

  // Subtle darker patches
  const rand = seededRandom(501)
  for (let i = 0; i < 20; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 10 + rand() * 30
    ctx.fillStyle = `rgba(200, 195, 185, 0.05)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return ctx.canvas
}

function generateSubwayTile(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  // White base
  ctx.fillStyle = '#F5F3F0'
  ctx.fillRect(0, 0, size, size)

  const tileW = size / 4
  const tileH = size / 8
  const grout = 1.5

  // Grout color
  ctx.fillStyle = '#D8D2CC'

  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : tileW / 2
    for (let col = -1; col < 5; col++) {
      const x = col * tileW + offset
      const y = row * tileH

      // Tile fill (slight variation)
      const rand2 = seededRandom(600 + row * 20 + col)
      const b = 0.96 + rand2() * 0.04
      const [r, g, bl] = hexToRgb('#F5F3F0')
      ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(bl * b)})`
      ctx.fillRect(x + grout, y + grout, tileW - grout * 2, tileH - grout * 2)
    }

    // Horizontal grout
    ctx.fillStyle = '#D8D2CC'
    ctx.fillRect(0, row * tileH, size, grout)
  }

  // Bottom grout line
  ctx.fillStyle = '#D8D2CC'
  ctx.fillRect(0, size - grout, size, grout)

  // Vertical grout lines
  for (let col = 0; col <= 4; col++) {
    ctx.fillRect(col * tileW, 0, grout, size)
  }

  addNoise(ctx, 0.015, 601)
  return ctx.canvas
}

function generateBrick(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  // Mortar color (background)
  ctx.fillStyle = '#D0C8C0'
  ctx.fillRect(0, 0, size, size)

  const brickW = size / 4
  const brickH = size / 8
  const mortar = 2

  const rand = seededRandom(700)

  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2
    for (let col = -1; col < 5; col++) {
      const x = col * brickW + offset
      const y = row * brickH

      // Brick color variation (red/brown range)
      const hue = 0.85 + rand() * 0.3
      const baseR = Math.round(160 * hue)
      const baseG = Math.round(75 * hue)
      const baseB = Math.round(55 * hue)
      ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`
      ctx.fillRect(x + mortar, y + mortar, brickW - mortar * 2, brickH - mortar * 2)

      // Subtle noise on each brick
      const brickRand = seededRandom(700 + row * 100 + col)
      for (let n = 0; n < 5; n++) {
        const nx = x + mortar + brickRand() * (brickW - mortar * 2)
        const ny = y + mortar + brickRand() * (brickH - mortar * 2)
        ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + brickRand() * 0.05})`
        ctx.beginPath()
        ctx.arc(nx, ny, 2 + brickRand() * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  addNoise(ctx, 0.02, 701)
  return ctx.canvas
}

// ─── Ceiling Presets ────────────────────────────────────────────────────

function generateSmoothWhite(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  ctx.fillStyle = '#FAFAF8'
  ctx.fillRect(0, 0, size, size)

  // Very subtle noise
  addNoise(ctx, 0.012, 800)

  return ctx.canvas
}

function generateCoffered(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(900)

  // Base
  ctx.fillStyle = '#F0EDE8'
  ctx.fillRect(0, 0, size, size)

  const panelCount = 4
  const panelSize = size / panelCount
  const beamWidth = size / 20

  for (let row = 0; row < panelCount; row++) {
    for (let col = 0; col < panelCount; col++) {
      const x = col * panelSize
      const y = row * panelSize

      // Recessed panel (slightly darker)
      const brightness = 0.92 + rand() * 0.06
      ctx.fillStyle = `rgb(${Math.round(240 * brightness)}, ${Math.round(237 * brightness)}, ${Math.round(232 * brightness)})`
      ctx.fillRect(x + beamWidth, y + beamWidth, panelSize - beamWidth * 2, panelSize - beamWidth * 2)

      // Shadow on top/left edges of recess
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
      ctx.fillRect(x + beamWidth, y + beamWidth, panelSize - beamWidth * 2, 2)
      ctx.fillRect(x + beamWidth, y + beamWidth, 2, panelSize - beamWidth * 2)

      // Highlight on bottom/right edges
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.fillRect(x + beamWidth, y + panelSize - beamWidth - 2, panelSize - beamWidth * 2, 2)
      ctx.fillRect(x + panelSize - beamWidth - 2, y + beamWidth, 2, panelSize - beamWidth * 2)
    }
  }

  // Beam color
  ctx.fillStyle = '#E8E4DF'
  for (let i = 0; i <= panelCount; i++) {
    ctx.fillRect(i * panelSize - beamWidth / 2, 0, beamWidth, size)
    ctx.fillRect(0, i * panelSize - beamWidth / 2, size, beamWidth)
  }

  addNoise(ctx, 0.015, 901)
  return ctx.canvas
}

// ─── Additional Floor Presets ───────────────────────────────────────────

function generateDarkWalnut(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1100)

  ctx.fillStyle = '#3E2723'
  ctx.fillRect(0, 0, size, size)

  const plankHeight = size / 6
  for (let row = 0; row < 6; row++) {
    const y = row * plankHeight
    const offset = row % 2 === 0 ? 0 : size / 4

    const brightness = 0.85 + rand() * 0.3
    const [r, g, b] = hexToRgb('#4E342E')
    ctx.fillStyle = `rgb(${Math.round(r * brightness)}, ${Math.round(g * brightness)}, ${Math.round(b * brightness)})`
    ctx.fillRect(0, y, size, plankHeight - 1)

    // Wood grain
    ctx.strokeStyle = `rgba(30, 15, 5, ${0.1 + rand() * 0.1})`
    ctx.lineWidth = 0.5
    for (let i = 0; i < 8; i++) {
      const gy = y + rand() * plankHeight
      ctx.beginPath()
      ctx.moveTo(0, gy)
      for (let x = 0; x < size; x += 3) {
        ctx.lineTo(x, gy + Math.sin(x * 0.04 + rand() * 3) * 1.5)
      }
      ctx.stroke()
    }

    ctx.fillStyle = '#2C1A12'
    ctx.fillRect(0, y + plankHeight - 1, size, 1)
    if (offset > 0) {
      ctx.fillRect(offset, y, 1, plankHeight)
    }
  }

  addNoise(ctx, 0.03, 1101)
  return ctx.canvas
}

function generateTerracotta(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1200)

  ctx.fillStyle = '#C4704A'
  ctx.fillRect(0, 0, size, size)

  const tileSize = size / 4
  const grout = 2

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * tileSize
      const y = row * tileSize

      const hue = 0.9 + rand() * 0.2
      const [r, g, b] = hexToRgb('#C4704A')
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(r * hue))}, ${Math.round(g * hue)}, ${Math.round(b * hue)})`
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, tileSize - grout * 2)

      // Surface variation
      for (let n = 0; n < 8; n++) {
        const nx = x + grout + rand() * (tileSize - grout * 2)
        const ny = y + grout + rand() * (tileSize - grout * 2)
        ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0}, ${rand() > 0.5 ? 200 : 50}, ${rand() > 0.5 ? 150 : 30}, 0.04)`
        ctx.beginPath()
        ctx.arc(nx, ny, 3 + rand() * 5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // Grout
  ctx.fillStyle = '#A08878'
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(i * tileSize - grout / 2, 0, grout, size)
    ctx.fillRect(0, i * tileSize - grout / 2, size, grout)
  }

  addNoise(ctx, 0.04, 1201)
  return ctx.canvas
}

function generatePorcelainTile(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1300)

  ctx.fillStyle = '#E8E4E0'
  ctx.fillRect(0, 0, size, size)

  const tileSize = size / 3
  const grout = 1

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * tileSize
      const y = row * tileSize

      const b = 0.95 + rand() * 0.1
      const [r, g, bl] = hexToRgb('#E8E4E0')
      ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(bl * b)})`
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, tileSize - grout * 2)

      // Subtle vein
      ctx.strokeStyle = `rgba(200, 195, 190, ${0.15 + rand() * 0.1})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x + rand() * tileSize, y)
      ctx.lineTo(x + rand() * tileSize, y + tileSize)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#D0CCC8'
  for (let i = 0; i <= 3; i++) {
    ctx.fillRect(i * tileSize, 0, grout, size)
    ctx.fillRect(0, i * tileSize, size, grout)
  }

  addNoise(ctx, 0.015, 1301)
  return ctx.canvas
}

// ─── Additional Wall Presets ────────────────────────────────────────────

function generateExposedConcrete(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  ctx.fillStyle = '#9E9A95'
  ctx.fillRect(0, 0, size, size)

  addNoise(ctx, 0.1, 1400)

  // Form lines (horizontal)
  const rand = seededRandom(1401)
  for (let i = 0; i < 6; i++) {
    const y = (i + 1) * size / 7 + (rand() - 0.5) * 10
    ctx.strokeStyle = `rgba(120, 115, 110, ${0.15 + rand() * 0.1})`
    ctx.lineWidth = 1 + rand()
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x < size; x += 8) {
      ctx.lineTo(x, y + (rand() - 0.5) * 2)
    }
    ctx.stroke()
  }

  // Pock marks
  for (let i = 0; i < 40; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.fillStyle = `rgba(140, 135, 130, ${0.08 + rand() * 0.1})`
    ctx.beginPath()
    ctx.arc(x, y, 1 + rand() * 3, 0, Math.PI * 2)
    ctx.fill()
  }

  return ctx.canvas
}

function generateWoodPanel(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1500)

  ctx.fillStyle = '#A08060'
  ctx.fillRect(0, 0, size, size)

  const panelW = size / 5
  const groove = 2

  for (let col = 0; col < 5; col++) {
    const x = col * panelW
    const b = 0.85 + rand() * 0.3
    const [r, g, b2] = hexToRgb('#A08060')
    ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(b2 * b)})`
    ctx.fillRect(x + groove, 0, panelW - groove * 2, size)

    // Grain lines (vertical)
    ctx.strokeStyle = `rgba(80, 55, 35, ${0.06 + rand() * 0.06})`
    ctx.lineWidth = 0.5
    for (let i = 0; i < 6; i++) {
      const gx = x + groove + rand() * (panelW - groove * 2)
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      for (let y = 0; y < size; y += 5) {
        ctx.lineTo(gx + Math.sin(y * 0.03 + rand()) * 1.5, y)
      }
      ctx.stroke()
    }

    // Groove shadow
    ctx.fillStyle = '#6B5040'
    ctx.fillRect(x + panelW - groove, 0, groove, size)
  }

  addNoise(ctx, 0.025, 1501)
  return ctx.canvas
}

function generateStoneWall(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1600)

  ctx.fillStyle = '#A09890'
  ctx.fillRect(0, 0, size, size)

  const stoneW = size / 4
  const stoneH = size / 6
  const mortar = 2

  for (let row = 0; row < 6; row++) {
    const offset = row % 2 === 0 ? 0 : stoneW / 2
    for (let col = -1; col < 5; col++) {
      const x = col * stoneW + offset
      const y = row * stoneH

      const b = 0.8 + rand() * 0.4
      const [r, g, b2] = hexToRgb('#8A8278')
      ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(b2 * b)})`
      ctx.fillRect(x + mortar, y + mortar, stoneW - mortar * 2, stoneH - mortar * 2)

      // Surface texture
      for (let n = 0; n < 10; n++) {
        const nx = x + mortar + rand() * (stoneW - mortar * 2)
        const ny = y + mortar + rand() * (stoneH - mortar * 2)
        ctx.fillStyle = `rgba(${rand() > 0.5 ? 200 : 100}, ${rand() > 0.5 ? 195 : 95}, ${rand() > 0.5 ? 190 : 90}, 0.06)`
        ctx.beginPath()
        ctx.arc(nx, ny, 2 + rand() * 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  addNoise(ctx, 0.04, 1601)
  return ctx.canvas
}

// ─── Additional Ceiling Presets ─────────────────────────────────────────

function generateFlatWhite(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, size, size)

  addNoise(ctx, 0.008, 1700)

  return ctx.canvas
}

function generateGridTile(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(1800)

  ctx.fillStyle = '#F5F5F3'
  ctx.fillRect(0, 0, size, size)

  const tileSize = size / 6
  const grout = 1

  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * tileSize
      const y = row * tileSize

      const b = 0.97 + rand() * 0.06
      const [r, g, bl] = hexToRgb('#F5F5F3')
      ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(bl * b)})`
      ctx.fillRect(x + grout, y + grout, tileSize - grout * 2, tileSize - grout * 2)
    }
  }

  ctx.fillStyle = '#E0DDD8'
  for (let i = 0; i <= 6; i++) {
    ctx.fillRect(i * tileSize, 0, grout, size)
    ctx.fillRect(0, i * tileSize, size, grout)
  }

  addNoise(ctx, 0.01, 1801)
  return ctx.canvas
}

// ─── Shader Preset Preview Thumbnails ───────────────────────────────────

function generateWoodGrainPreview(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)

  ctx.fillStyle = '#A07830'
  ctx.fillRect(0, 0, size, size)

  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin(y * 0.08 + Math.sin(y * 0.02) * 3) * 0.5 + 0.5
    const [r, g, b] = hexToRgb('#8B6914')
    const [r2, g2, b2] = hexToRgb('#C4A265')
    const t = wave
    ctx.fillStyle = `rgb(${Math.round(r + (r2 - r) * t)}, ${Math.round(g + (g2 - g) * t)}, ${Math.round(b + (b2 - b) * t)})`
    ctx.fillRect(0, y, size, 2)
  }

  const dist = (x: number, y: number) => Math.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x += 3) {
      const d = dist(x, y)
      const ring = Math.sin(d * 0.15 + x * 0.02) * 0.5 + 0.5
      if (ring < 0.3) {
        ctx.fillStyle = 'rgba(74, 53, 32, 0.1)'
        ctx.fillRect(x, y, 3, 1)
      }
    }
  }

  addNoise(ctx, 0.04, 2001)
  return ctx.canvas
}

function generateMarbleVeinPreview(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(2100)

  ctx.fillStyle = '#F0EDE8'
  ctx.fillRect(0, 0, size, size)

  // Veins
  for (let v = 0; v < 12; v++) {
    ctx.strokeStyle = `rgba(138, 128, 120, ${0.2 + rand() * 0.3})`
    ctx.lineWidth = 1 + rand() * 2
    ctx.beginPath()
    let x = rand() * size
    let y = rand() * size
    ctx.moveTo(x, y)
    for (let s = 0; s < 40; s++) {
      x += (rand() - 0.5) * 15
      y += (rand() - 0.3) * 12
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // Sheen
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.03 + rand() * 0.05})`
    ctx.beginPath()
    ctx.arc(rand() * size, rand() * size, 2 + rand() * 4, 0, Math.PI * 2)
    ctx.fill()
  }

  addNoise(ctx, 0.025, 2101)
  return ctx.canvas
}

function generateConcreteProcPreview(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(2200)

  ctx.fillStyle = '#A09A94'
  ctx.fillRect(0, 0, size, size)

  addNoise(ctx, 0.1, 2201)

  // Aggregate
  for (let i = 0; i < 80; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 3
    ctx.fillStyle = `rgba(112, 104, 96, ${0.15 + rand() * 0.15})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  return ctx.canvas
}

function generateStoneProcPreview(size: number): HTMLCanvasElement {
  const ctx = createCanvas(size)
  const rand = seededRandom(2300)

  ctx.fillStyle = '#D0C8C0'
  ctx.fillRect(0, 0, size, size)

  const blockW = size / 4
  const blockH = size / 6
  const mortar = 2

  for (let row = 0; row < 6; row++) {
    const offset = row % 2 === 0 ? 0 : blockW / 2
    for (let col = -1; col < 5; col++) {
      const x = col * blockW + offset
      const y = row * blockH

      const b = 0.75 + rand() * 0.4
      const [r, g, b2] = hexToRgb('#8A8278')
      ctx.fillStyle = `rgb(${Math.round(r * b)}, ${Math.round(g * b)}, ${Math.round(b2 * b)})`
      ctx.fillRect(x + mortar, y + mortar, blockW - mortar * 2, blockH - mortar * 2)
    }
  }

  addNoise(ctx, 0.05, 2301)
  return ctx.canvas
}

// ─── Preset Registry ────────────────────────────────────────────────────

export const PRESETS: TexturePreset[] = [
  // Floor — canvas
  { id: 'oak_plank', name: 'Oak Plank', category: 'floor', generate: generateOakPlank },
  { id: 'dark_walnut', name: 'Dark Walnut', category: 'floor', generate: generateDarkWalnut },
  { id: 'marble_tile', name: 'Marble Tile', category: 'floor', generate: generateMarbleTile },
  { id: 'herringbone', name: 'Herringbone', category: 'floor', generate: generateHerringbone },
  { id: 'terracotta', name: 'Terracotta', category: 'floor', generate: generateTerracotta },
  { id: 'porcelain_tile', name: 'Porcelain', category: 'floor', generate: generatePorcelainTile },
  { id: 'concrete', name: 'Concrete', category: 'floor', generate: generateConcrete },
  // Floor — shader
  { id: 'wood_grain', name: 'Wood Grain (Shader)', category: 'floor', generate: generateWoodGrainPreview },
  { id: 'marble_vein', name: 'Marble Vein (Shader)', category: 'floor', generate: generateMarbleVeinPreview },
  { id: 'concrete_proc', name: 'Concrete (Shader)', category: 'floor', generate: generateConcreteProcPreview },
  { id: 'stone_proc', name: 'Stone (Shader)', category: 'floor', generate: generateStoneProcPreview },
  // Wall — canvas
  { id: 'white_plaster', name: 'White Plaster', category: 'wall', generate: generateWhitePlaster },
  { id: 'subway_tile', name: 'Subway Tile', category: 'wall', generate: generateSubwayTile },
  { id: 'brick', name: 'Brick', category: 'wall', generate: generateBrick },
  { id: 'exposed_concrete', name: 'Exposed Concrete', category: 'wall', generate: generateExposedConcrete },
  { id: 'wood_panel', name: 'Wood Panel', category: 'wall', generate: generateWoodPanel },
  { id: 'stone_wall', name: 'Stone Wall', category: 'wall', generate: generateStoneWall },
  // Wall — shader
  { id: 'stone_proc', name: 'Stone (Shader)', category: 'wall', generate: generateStoneProcPreview },
  // Ceiling
  { id: 'smooth_white', name: 'Smooth White', category: 'ceiling', generate: generateSmoothWhite },
  { id: 'flat_white', name: 'Flat White', category: 'ceiling', generate: generateFlatWhite },
  { id: 'coffered', name: 'Coffered', category: 'ceiling', generate: generateCoffered },
  { id: 'grid_tile', name: 'Grid Tile', category: 'ceiling', generate: generateGridTile },
]

// ─── Texture Cache ──────────────────────────────────────────────────────

const textureCache = new Map<string, THREE.CanvasTexture>()

export function getTexture(presetId: string): THREE.CanvasTexture | null {
  const cached = textureCache.get(presetId)
  if (cached) return cached

  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) return null

  const canvas = preset.generate(512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  tex.colorSpace = THREE.SRGBColorSpace
  textureCache.set(presetId, tex)
  return tex
}

export function generatePreviewDataURL(presetId: string, size = 64): string {
  const preset = PRESETS.find((p) => p.id === presetId)
  if (!preset) return ''
  const canvas = preset.generate(size)
  return canvas.toDataURL()
}

export function clearTextureCache(): void {
  textureCache.forEach((tex) => tex.dispose())
  textureCache.clear()
}
