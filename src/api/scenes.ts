import { invoke } from '@tauri-apps/api/core'
import type { HomeSceneJSON } from '@/types/scene'

export interface SceneInfo {
  id: string
  projectId: string
  fileId: string
  name: string
  schemaVersion: string
  sceneJson: HomeSceneJSON | null
  createdAt: string
  updatedAt: string
}

interface SceneApi {
  id: string
  project_id: string
  file_id: string
  name: string
  schema_version: string
  scene_json: HomeSceneJSON | null
  created_at: string
  updated_at: string
}

function fromApi(s: SceneApi): SceneInfo {
  return {
    id: s.id,
    projectId: s.project_id,
    fileId: s.file_id,
    name: s.name,
    schemaVersion: s.schema_version,
    sceneJson: s.scene_json,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }
}

export async function listScenes(projectId: string): Promise<SceneInfo[]> {
  const res = await invoke<SceneApi[]>('list_scenes', { projectId })
  return res.map(fromApi)
}

export async function getScene(sceneId: string): Promise<SceneInfo | null> {
  try {
    const res = await invoke<SceneApi | null>('get_scene', { sceneId })
    return res ? fromApi(res) : null
  } catch {
    return null
  }
}

export async function updateScene(
  sceneId: string,
  scene: HomeSceneJSON,
): Promise<void> {
  await invoke('update_scene', { sceneId, sceneJson: scene })
}

export async function deleteScene(sceneId: string): Promise<void> {
  await invoke('delete_scene', { sceneId })
}
