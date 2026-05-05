import { invoke } from '@tauri-apps/api/core'
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
    const res = await invoke<SceneApi | null>('get_scene', { projectId })
    return res?.scene_json ?? null
  } catch {
    return null
  }
}

export async function updateScene(
  projectId: string,
  scene: HomeSceneJSON,
): Promise<void> {
  await invoke('update_scene', { projectId, sceneJson: scene })
}
