import type { RoomType } from '@/types/scene'

export type PlacementZone =
  | 'wall_south'
  | 'wall_north'
  | 'wall_left'
  | 'wall_right'
  | 'center'
  | 'corner'
  | 'around_table'

export interface FurniturePlacement {
  category: string
  count: number
  placement: PlacementZone
  rotation: number
}

export const roomFurnitureMap: Record<RoomType, FurniturePlacement[]> = {
  living_room: [
    { category: 'sofa', count: 1, placement: 'wall_south', rotation: 0 },
    { category: 'coffee_table', count: 1, placement: 'center', rotation: 0 },
    { category: 'tv_stand', count: 1, placement: 'wall_north', rotation: 0 },
  ],
  bedroom: [
    { category: 'bed_double', count: 1, placement: 'center', rotation: 0 },
    { category: 'nightstand', count: 2, placement: 'wall_north', rotation: 0 },
    { category: 'wardrobe', count: 1, placement: 'wall_left', rotation: 0 },
  ],
  kitchen: [
    { category: 'kitchen_counter', count: 1, placement: 'wall_left', rotation: Math.PI / 2 },
    { category: 'fridge', count: 1, placement: 'corner', rotation: 0 },
  ],
  bathroom: [
    { category: 'toilet', count: 1, placement: 'wall_north', rotation: 0 },
    { category: 'bathroom_sink', count: 1, placement: 'wall_right', rotation: 0 },
    { category: 'shower', count: 1, placement: 'corner', rotation: 0 },
  ],
  dining_room: [
    { category: 'dining_table', count: 1, placement: 'center', rotation: 0 },
    { category: 'dining_chair', count: 4, placement: 'around_table', rotation: 0 },
  ],
  study: [
    { category: 'desk', count: 1, placement: 'wall_north', rotation: 0 },
    { category: 'bookshelf', count: 1, placement: 'wall_left', rotation: 0 },
  ],
  balcony: [],
  corridor: [],
}
