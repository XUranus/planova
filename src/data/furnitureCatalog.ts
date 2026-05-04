import type { Vec3 } from '@/types/scene'

export interface FurnitureDef {
  category: string
  label: string
  size: Vec3
  color: string
}

export const furnitureCatalog: Record<string, FurnitureDef> = {
  sofa: { category: 'sofa', label: 'Sofa', size: [2.2, 0.85, 0.9], color: '#8B7D6B' },
  coffee_table: { category: 'coffee_table', label: 'Coffee Table', size: [1.2, 0.45, 0.6], color: '#6B4F3A' },
  tv_stand: { category: 'tv_stand', label: 'TV Stand', size: [1.8, 0.5, 0.4], color: '#5A4A3A' },
  bed_double: { category: 'bed', label: 'Double Bed', size: [2.0, 0.55, 1.6], color: '#E8DDD0' },
  bed_single: { category: 'bed', label: 'Single Bed', size: [2.0, 0.55, 1.0], color: '#E8DDD0' },
  nightstand: { category: 'nightstand', label: 'Nightstand', size: [0.5, 0.55, 0.4], color: '#6B4F3A' },
  wardrobe: { category: 'wardrobe', label: 'Wardrobe', size: [1.8, 2.2, 0.6], color: '#7A6A5A' },
  dining_table: { category: 'dining_table', label: 'Dining Table', size: [1.6, 0.75, 0.9], color: '#6B4F3A' },
  dining_chair: { category: 'dining_chair', label: 'Dining Chair', size: [0.45, 0.9, 0.45], color: '#7A6A5A' },
  desk: { category: 'desk', label: 'Desk', size: [1.4, 0.75, 0.7], color: '#6B4F3A' },
  bookshelf: { category: 'bookshelf', label: 'Bookshelf', size: [1.0, 2.0, 0.35], color: '#7A6A5A' },
  bathroom_sink: { category: 'bathroom_sink', label: 'Sink', size: [0.6, 0.85, 0.5], color: '#FFFFFF' },
  toilet: { category: 'toilet', label: 'Toilet', size: [0.4, 0.75, 0.65], color: '#F0F0F0' },
  shower: { category: 'shower', label: 'Shower', size: [1.0, 2.1, 1.0], color: '#D0E4F0' },
  kitchen_counter: { category: 'kitchen_counter', label: 'Counter', size: [2.4, 0.9, 0.6], color: '#B0A898' },
  fridge: { category: 'fridge', label: 'Refrigerator', size: [0.7, 1.8, 0.65], color: '#C0C0C0' },
}
