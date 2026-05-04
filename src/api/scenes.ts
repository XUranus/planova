import { get, patch } from './client'
import type { HomeSceneJSON } from '@/types/scene'

interface SceneApi {
  id: string
  project_id: string
  schema_version: string
  scene_json: HomeSceneJSON | null
  created_at: string
  updated_at: string
}

export async function getScene(projectId: string): Promise<HomeSceneJSON | null> {
  try {
    const res = await get<SceneApi>(`/api/projects/${projectId}/scene`)
    return res.scene_json
  } catch {
    return null
  }
}

export async function updateScene(
  projectId: string,
  scene: HomeSceneJSON,
): Promise<void> {
  await patch(`/api/projects/${projectId}/scene`, { scene_json: scene })
}
