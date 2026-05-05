import type { Project } from '@/types/project'
import type { TestSceneId } from '@/data/testScenes'

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'test_studio',
    name: 'Studio Apartment',
    description: '~30m² studio with living room, kitchen, and bathroom.',
    style: 'modern_luxury',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'test_2br',
    name: 'Two-Bedroom Apartment',
    description: '~75m² apartment with master bedroom, second bedroom, living room, kitchen, and bathroom.',
    style: 'modern_luxury',
    status: 'completed',
    createdAt: '',
    updatedAt: '',
  },
]

export function isDemoProject(id: string): boolean {
  return id === 'test_studio' || id === 'test_2br'
}

export function demoIdToSceneId(id: string): TestSceneId | null {
  if (id === 'test_studio') return 'studio'
  if (id === 'test_2br') return 'twoBedroom'
  return null
}
