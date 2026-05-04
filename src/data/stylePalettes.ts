import type { SceneMaterial } from '@/types/scene'

interface MaterialSpec {
  base_color: string
  roughness: number
  metalness: number
  transparent?: boolean
  opacity?: number
}

interface StylePalette {
  id: string
  materials: {
    wall: MaterialSpec
    ceiling: MaterialSpec
    door: MaterialSpec
    window: MaterialSpec
    floor: Record<string, MaterialSpec> // keyed by room type
  }
}

const palettes: Record<string, StylePalette> = {
  modern_luxury: {
    id: 'modern_luxury',
    materials: {
      wall: { base_color: '#C8C0B8', roughness: 0.85, metalness: 0.0 },
      ceiling: { base_color: '#F0EDE8', roughness: 0.9, metalness: 0.0 },
      door: { base_color: '#4A3728', roughness: 0.5, metalness: 0.1 },
      window: { base_color: '#B5D4E8', roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4 },
      floor: {
        living_room: { base_color: '#6B4F3A', roughness: 0.6, metalness: 0.0 },
        bedroom: { base_color: '#7A6050', roughness: 0.65, metalness: 0.0 },
        kitchen: { base_color: '#8A8078', roughness: 0.5, metalness: 0.05 },
        bathroom: { base_color: '#A0A0A0', roughness: 0.3, metalness: 0.0 },
        dining_room: { base_color: '#6B4F3A', roughness: 0.6, metalness: 0.0 },
        corridor: { base_color: '#6B4F3A', roughness: 0.6, metalness: 0.0 },
        study: { base_color: '#5A4A3A', roughness: 0.6, metalness: 0.0 },
        balcony: { base_color: '#9A9088', roughness: 0.4, metalness: 0.0 },
      },
    },
  },
  cream: {
    id: 'cream',
    materials: {
      wall: { base_color: '#F5F0E6', roughness: 0.9, metalness: 0.0 },
      ceiling: { base_color: '#FFFFFF', roughness: 0.95, metalness: 0.0 },
      door: { base_color: '#B89B71', roughness: 0.55, metalness: 0.0 },
      window: { base_color: '#C8DDE8', roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.45 },
      floor: {
        living_room: { base_color: '#D4B896', roughness: 0.65, metalness: 0.0 },
        bedroom: { base_color: '#DEC8A8', roughness: 0.7, metalness: 0.0 },
        kitchen: { base_color: '#E0D8C8', roughness: 0.45, metalness: 0.0 },
        bathroom: { base_color: '#D8D0C8', roughness: 0.3, metalness: 0.0 },
        dining_room: { base_color: '#D4B896', roughness: 0.65, metalness: 0.0 },
        corridor: { base_color: '#D4B896', roughness: 0.65, metalness: 0.0 },
        study: { base_color: '#C8B090', roughness: 0.65, metalness: 0.0 },
        balcony: { base_color: '#C0B8A8', roughness: 0.4, metalness: 0.0 },
      },
    },
  },
  nordic: {
    id: 'nordic',
    materials: {
      wall: { base_color: '#EBEBEB', roughness: 0.88, metalness: 0.0 },
      ceiling: { base_color: '#F8F8F8', roughness: 0.92, metalness: 0.0 },
      door: { base_color: '#A89070', roughness: 0.5, metalness: 0.0 },
      window: { base_color: '#D0E4F0', roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.35 },
      floor: {
        living_room: { base_color: '#C9B896', roughness: 0.6, metalness: 0.0 },
        bedroom: { base_color: '#D0C0A0', roughness: 0.65, metalness: 0.0 },
        kitchen: { base_color: '#D8D0C8', roughness: 0.45, metalness: 0.0 },
        bathroom: { base_color: '#E0E0E0', roughness: 0.3, metalness: 0.0 },
        dining_room: { base_color: '#C9B896', roughness: 0.6, metalness: 0.0 },
        corridor: { base_color: '#C9B896', roughness: 0.6, metalness: 0.0 },
        study: { base_color: '#B8A888', roughness: 0.6, metalness: 0.0 },
        balcony: { base_color: '#B0A898', roughness: 0.4, metalness: 0.0 },
      },
    },
  },
}

export function generateMaterialsForStyle(style: string): SceneMaterial[] {
  const palette = palettes[style] || palettes.modern_luxury
  const materials: SceneMaterial[] = []

  // Wall
  materials.push({
    id: `mat_${style}_wall`,
    type: 'pbr',
    name: `${style} Wall`,
    ...palette.materials.wall,
  })

  // Ceiling
  materials.push({
    id: `mat_${style}_ceiling`,
    type: 'pbr',
    name: `${style} Ceiling`,
    ...palette.materials.ceiling,
  })

  // Door
  materials.push({
    id: `mat_${style}_door`,
    type: 'pbr',
    name: `${style} Door`,
    ...palette.materials.door,
  })

  // Window
  materials.push({
    id: `mat_${style}_window`,
    type: 'pbr',
    name: `${style} Window`,
    ...palette.materials.window,
  })

  // Floor per room type
  for (const [roomType, spec] of Object.entries(palette.materials.floor)) {
    materials.push({
      id: `mat_${style}_floor_${roomType}`,
      type: 'pbr',
      name: `${style} Floor ${roomType}`,
      ...spec,
    })
  }

  return materials
}

export function getFloorMaterialId(style: string, roomType: string): string {
  if (palettes[style]?.materials.floor[roomType]) {
    return `mat_${style}_floor_${roomType}`
  }
  return `mat_${style}_floor_living_room`
}
