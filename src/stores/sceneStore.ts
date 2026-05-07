import { create } from 'zustand'
import * as THREE from 'three'
import type { HomeSceneJSON } from '@/types/scene'
import type { BuiltObject } from '@/engine/buildObjects'
import { testScenes, type TestSceneId } from '@/data/testScenes'
import * as scenesApi from '@/api/scenes'
import type { SceneInfo } from '@/api/scenes'

interface SceneState {
  // Multi-scene list
  scenes: SceneInfo[]
  activeSceneId: string | null

  // Currently loaded scene data for 3D viewer
  homeScene: HomeSceneJSON | null
  builtObjects: BuiltObject[]
  builtGroup: THREE.Group | null
  projectId: string | null

  // JSON editor anti-loop: tracks last editor-originated change
  lastEditorChange: number

  setHomeScene: (scene: HomeSceneJSON | null, source?: 'editor' | '3d') => void
  setBuiltObjects: (objects: BuiltObject[]) => void
  setBuiltGroup: (group: THREE.Group | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
  fetchScenes: (projectId: string) => Promise<void>
  loadScene: (sceneId: string) => Promise<void>
  saveScene: () => Promise<void>
  clearScene: () => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  activeSceneId: null,
  homeScene: null,
  builtObjects: [],
  builtGroup: null,
  projectId: null,
  lastEditorChange: 0,

  setHomeScene: (scene, source = '3d') => {
    const patch: Record<string, unknown> = { homeScene: scene }
    if (source === 'editor') {
      patch.lastEditorChange = Date.now()
    }
    set(patch)
  },
  setBuiltObjects: (objects) => set({ builtObjects: objects }),
  setBuiltGroup: (group) => set({ builtGroup: group }),

  loadTestScene: (sceneId) => {
    const scene = testScenes[sceneId]
    if (scene) {
      set({ homeScene: scene, projectId: null, activeSceneId: null, scenes: [] })
    }
  },

  fetchScenes: async (projectId) => {
    const scenes = await scenesApi.listScenes(projectId)
    set({ scenes, projectId })
    // Auto-load first scene if none is active
    const { activeSceneId } = get()
    if (!activeSceneId && scenes.length > 0) {
      await get().loadScene(scenes[0].id)
    }
  },

  loadScene: async (sceneId) => {
    const sceneInfo = await scenesApi.getScene(sceneId)
    if (sceneInfo) {
      set({
        homeScene: sceneInfo.sceneJson,
        activeSceneId: sceneId,
        projectId: sceneInfo.projectId,
      })
    }
  },

  saveScene: async () => {
    const { homeScene, activeSceneId } = get()
    if (!homeScene || !activeSceneId) return
    await scenesApi.updateScene(activeSceneId, homeScene)
  },

  clearScene: () => set({ homeScene: null, projectId: null, activeSceneId: null, scenes: [] }),
}))
