import { create } from 'zustand'
import * as THREE from 'three'
import type { HomeSceneJSON } from '@/types/scene'
import type { BuiltObject } from '@/engine/buildObjects'
import { testScenes, type TestSceneId } from '@/data/testScenes'
import * as scenesApi from '@/api/scenes'

interface SceneState {
  homeScene: HomeSceneJSON | null
  builtObjects: BuiltObject[]
  builtGroup: THREE.Group | null
  projectId: string | null

  setHomeScene: (scene: HomeSceneJSON | null) => void
  setBuiltObjects: (objects: BuiltObject[]) => void
  setBuiltGroup: (group: THREE.Group | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
  fetchScene: (projectId: string) => Promise<void>
  saveScene: () => Promise<void>
  clearScene: () => void
}

export const useSceneStore = create<SceneState>((set, get) => ({
  homeScene: null,
  builtObjects: [],
  builtGroup: null,
  projectId: null,

  setHomeScene: (scene) => set({ homeScene: scene }),
  setBuiltObjects: (objects) => set({ builtObjects: objects }),
  setBuiltGroup: (group) => set({ builtGroup: group }),

  loadTestScene: (sceneId) => {
    const scene = testScenes[sceneId]
    if (scene) {
      set({ homeScene: scene, projectId: null })
    }
  },

  fetchScene: async (projectId) => {
    const scene = await scenesApi.getScene(projectId)
    if (scene) {
      set({ homeScene: scene, projectId })
    }
  },

  saveScene: async () => {
    const { homeScene, projectId } = get()
    if (!homeScene || !projectId) return
    await scenesApi.updateScene(projectId, homeScene)
  },

  clearScene: () => set({ homeScene: null, projectId: null }),
}))
