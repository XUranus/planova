import type { HomeSceneJSON } from '@/types/scene'

/**
 * Studio apartment (~30m²)
 *
 * Layout (top-down, origin at bottom-left):
 *
 *   [0,6.5]─────────────────[7,6.5]
 *     │        living          │
 *     │       5m x 4.5m       │
 *     │                       │
 *   [0,2]─────────[3,2]─────[7,2]
 *     │  kitchen  │ │ bath   │
 *     │  3m x 2m  │ │2m x 2m│
 *   [0,0]─────────[3,0]─────[7,0]
 */
export const studioApartment: HomeSceneJSON = {
  schema_version: '0.1.0',
  project: {
    id: 'test_studio',
    name: 'Studio Apartment',
    unit: 'meter',
  },
  global: {
    style: 'modern_luxury',
    ceiling_height: 2.8,
    wall_thickness: 0.15,
  },
  rooms: [
    {
      id: 'room_living',
      type: 'living_room',
      name: 'Living Room',
      polygon: [
        [0, 2],
        [7, 2],
        [7, 6.5],
        [0, 6.5],
      ],
      area: 31.5,
    },
    {
      id: 'room_kitchen',
      type: 'kitchen',
      name: 'Kitchen',
      polygon: [
        [0, 0],
        [3, 0],
        [3, 2],
        [0, 2],
      ],
      area: 6.0,
    },
    {
      id: 'room_bathroom',
      type: 'bathroom',
      name: 'Bathroom',
      polygon: [
        [3, 0],
        [7, 0],
        [7, 2],
        [3, 2],
      ],
      area: 8.0,
    },
  ],
  walls: [
    // Bottom outer walls
    {
      id: 'wall_south_left',
      start: [0, 0],
      end: [3, 0],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_kitchen'],
    },
    {
      id: 'wall_south_right',
      start: [3, 0],
      end: [7, 0],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_bathroom'],
    },
    // Right outer wall
    {
      id: 'wall_east',
      start: [7, 0],
      end: [7, 6.5],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_bathroom', 'room_living'],
    },
    // Top outer wall
    {
      id: 'wall_north',
      start: [0, 6.5],
      end: [7, 6.5],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_living'],
    },
    // Left outer wall
    {
      id: 'wall_west',
      start: [0, 0],
      end: [0, 6.5],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_kitchen', 'room_living'],
    },
    // Internal partition wall (kitchen/bathroom top edge)
    {
      id: 'wall_partition_horizontal',
      start: [0, 2],
      end: [7, 2],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_kitchen', 'room_bathroom', 'room_living'],
    },
    // Internal vertical wall between kitchen and bathroom
    {
      id: 'wall_partition_vertical',
      start: [3, 0],
      end: [3, 2],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_kitchen', 'room_bathroom'],
    },
  ],
  openings: [
    // Kitchen door (on horizontal partition, leading to living)
    {
      id: 'door_kitchen',
      type: 'door',
      wall_ref: 'wall_partition_horizontal',
      position: [1, 2],
      width: 0.9,
      height: 2.1,
      sill_height: 0,
      swing: 'left_inward',
    },
    // Bathroom door (on horizontal partition, leading to living)
    {
      id: 'door_bathroom',
      type: 'door',
      wall_ref: 'wall_partition_horizontal',
      position: [5, 2],
      width: 0.8,
      height: 2.1,
      sill_height: 0,
      swing: 'right_inward',
    },
    // Kitchen window (on left wall)
    {
      id: 'window_kitchen',
      type: 'window',
      wall_ref: 'wall_west',
      position: [0, 0.8],
      width: 1.2,
      height: 1.2,
      sill_height: 0.9,
    },
    // Living room window (on right wall)
    {
      id: 'window_living_east',
      type: 'window',
      wall_ref: 'wall_east',
      position: [7, 4.5],
      width: 1.8,
      height: 1.4,
      sill_height: 0.9,
    },
    // Living room window (on north wall)
    {
      id: 'window_living_north',
      type: 'window',
      wall_ref: 'wall_north',
      position: [3.5, 6.5],
      width: 2.0,
      height: 1.4,
      sill_height: 0.9,
    },
  ],
  objects: [],
  materials: [],
  lights: [
    {
      id: 'light_living_main',
      type: 'area',
      name: 'Living Room Light',
      position: [3.5, 2.65, 4.25],
      rotation: [0, 0, 0],
      intensity: 500,
      color: '#fff4e6',
      size: [2, 1.5],
    },
    {
      id: 'light_kitchen_main',
      type: 'point',
      name: 'Kitchen Light',
      position: [1.5, 2.65, 1],
      rotation: [0, 0, 0],
      intensity: 400,
      color: '#ffffff',
    },
    {
      id: 'light_bathroom_main',
      type: 'point',
      name: 'Bathroom Light',
      position: [5, 2.65, 1],
      rotation: [0, 0, 0],
      intensity: 350,
      color: '#ffffff',
    },
  ],
  cameras: [
    {
      id: 'cam_overview',
      name: 'Overview',
      type: 'perspective',
      position: [3.5, 8, 10],
      target: [3.5, 0, 3.25],
      fov: 50,
    },
    {
      id: 'cam_living_entry',
      name: 'Living Room Entrance',
      type: 'perspective',
      position: [0.5, 1.6, 2.5],
      target: [5, 1.4, 5],
      fov: 65,
    },
  ],
}

/**
 * Two-bedroom apartment (~75m²)
 *
 * Layout (top-down, origin at bottom-left):
 *
 *   [0,10]──────────────────────[10,10]
 *     │                          │
 *     │      master bedroom      │ corridor
 *     │        5m x 4m          │ 1x10
 *   [0,6]────────[5,6]─────[9,6]│
 *     │           │         │    │
 *     │  living   │ kitchen │    │
 *     │  5m x 4m  │ 4m x 2m │    │
 *   [0,2]────────[5,2]─────[9,2]│
 *     │ bedroom2  │  bath   │    │
 *     │  5m x 2m  │ 4m x 2m │    │
 *   [0,0]────────[5,0]─────[9,0]───[10,0]
 */
export const twoBedroomApartment: HomeSceneJSON = {
  schema_version: '0.1.0',
  project: {
    id: 'test_2br',
    name: 'Two-Bedroom Apartment',
    unit: 'meter',
  },
  global: {
    style: 'modern_luxury',
    ceiling_height: 2.8,
    wall_thickness: 0.15,
  },
  rooms: [
    {
      id: 'room_master',
      type: 'bedroom',
      name: 'Master Bedroom',
      polygon: [
        [0, 6],
        [5, 6],
        [5, 10],
        [0, 10],
      ],
      area: 20.0,
    },
    {
      id: 'room_living',
      type: 'living_room',
      name: 'Living Room',
      polygon: [
        [0, 2],
        [5, 2],
        [5, 6],
        [0, 6],
      ],
      area: 20.0,
    },
    {
      id: 'room_bedroom2',
      type: 'bedroom',
      name: 'Bedroom 2',
      polygon: [
        [0, 0],
        [5, 0],
        [5, 2],
        [0, 2],
      ],
      area: 10.0,
    },
    {
      id: 'room_kitchen',
      type: 'kitchen',
      name: 'Kitchen',
      polygon: [
        [5, 4],
        [9, 4],
        [9, 6],
        [5, 6],
      ],
      area: 8.0,
    },
    {
      id: 'room_bathroom',
      type: 'bathroom',
      name: 'Bathroom',
      polygon: [
        [5, 0],
        [9, 0],
        [9, 2],
        [5, 2],
      ],
      area: 8.0,
    },
    {
      id: 'room_corridor',
      type: 'corridor',
      name: 'Corridor',
      polygon: [
        [9, 0],
        [10, 0],
        [10, 10],
        [9, 10],
      ],
      area: 10.0,
    },
  ],
  walls: [
    // Outer walls
    {
      id: 'wall_south',
      start: [0, 0],
      end: [10, 0],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_bedroom2', 'room_bathroom', 'room_corridor'],
    },
    {
      id: 'wall_east',
      start: [10, 0],
      end: [10, 10],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_corridor'],
    },
    {
      id: 'wall_north',
      start: [0, 10],
      end: [10, 10],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_master', 'room_corridor'],
    },
    {
      id: 'wall_west',
      start: [0, 0],
      end: [0, 10],
      height: 2.8,
      thickness: 0.15,
      room_refs: ['room_bedroom2', 'room_living', 'room_master'],
    },
    // Horizontal partitions
    {
      id: 'wall_h1_y2',
      start: [0, 2],
      end: [9, 2],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_bedroom2', 'room_bathroom', 'room_living'],
    },
    {
      id: 'wall_h2_y4',
      start: [5, 4],
      end: [9, 4],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_living', 'room_kitchen'],
    },
    {
      id: 'wall_h3_y6',
      start: [0, 6],
      end: [9, 6],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_living', 'room_kitchen', 'room_master'],
    },
    // Vertical partitions
    {
      id: 'wall_v1_x5',
      start: [5, 0],
      end: [5, 6],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_bedroom2', 'room_bathroom', 'room_living', 'room_kitchen'],
    },
    {
      id: 'wall_v2_x9',
      start: [9, 0],
      end: [9, 10],
      height: 2.8,
      thickness: 0.1,
      room_refs: ['room_bathroom', 'room_kitchen', 'room_corridor'],
    },
  ],
  openings: [
    // Bedroom 2 door (to corridor area, on v2 wall)
    {
      id: 'door_bedroom2',
      type: 'door',
      wall_ref: 'wall_v2_x9',
      position: [9, 1],
      width: 0.9,
      height: 2.1,
      sill_height: 0,
      swing: 'left_inward',
    },
    // Bathroom door (to corridor, on v2 wall)
    {
      id: 'door_bathroom',
      type: 'door',
      wall_ref: 'wall_v2_x9',
      position: [9, 3],
      width: 0.8,
      height: 2.1,
      sill_height: 0,
      swing: 'right_inward',
    },
    // Kitchen opening (to corridor, on v2 wall)
    {
      id: 'door_kitchen',
      type: 'door',
      wall_ref: 'wall_v2_x9',
      position: [9, 5],
      width: 1.0,
      height: 2.1,
      sill_height: 0,
      swing: 'left_inward',
    },
    // Living room door (to corridor, on v2 wall)
    {
      id: 'door_living',
      type: 'door',
      wall_ref: 'wall_v2_x9',
      position: [9, 7.5],
      width: 1.2,
      height: 2.1,
      sill_height: 0,
      swing: 'left_inward',
    },
    // Master bedroom door (to corridor, on v2 wall)
    {
      id: 'door_master',
      type: 'door',
      wall_ref: 'wall_v2_x9',
      position: [9, 9],
      width: 0.9,
      height: 2.1,
      sill_height: 0,
      swing: 'left_inward',
    },
    // Windows
    {
      id: 'window_master',
      type: 'window',
      wall_ref: 'wall_north',
      position: [2.5, 10],
      width: 2.0,
      height: 1.4,
      sill_height: 0.9,
    },
    {
      id: 'window_living',
      type: 'window',
      wall_ref: 'wall_west',
      position: [0, 4],
      width: 1.8,
      height: 1.4,
      sill_height: 0.9,
    },
    {
      id: 'window_bedroom2',
      type: 'window',
      wall_ref: 'wall_south',
      position: [2.5, 0],
      width: 1.5,
      height: 1.2,
      sill_height: 0.9,
    },
  ],
  objects: [],
  materials: [],
  lights: [
    {
      id: 'light_master',
      type: 'area',
      name: 'Master Bedroom Light',
      position: [2.5, 2.65, 8],
      rotation: [0, 0, 0],
      intensity: 400,
      color: '#fff4e6',
      size: [1.5, 1.5],
    },
    {
      id: 'light_living',
      type: 'area',
      name: 'Living Room Light',
      position: [2.5, 2.65, 4],
      rotation: [0, 0, 0],
      intensity: 500,
      color: '#fff4e6',
      size: [2, 1.5],
    },
    {
      id: 'light_kitchen',
      type: 'point',
      name: 'Kitchen Light',
      position: [7, 2.65, 5],
      rotation: [0, 0, 0],
      intensity: 400,
      color: '#ffffff',
    },
  ],
  cameras: [
    {
      id: 'cam_overview',
      name: 'Overview',
      type: 'perspective',
      position: [5, 12, 15],
      target: [5, 0, 5],
      fov: 50,
    },
  ],
}

export const testScenes = {
  studio: studioApartment,
  twoBedroom: twoBedroomApartment,
}

export type TestSceneId = keyof typeof testScenes
