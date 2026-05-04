import { create } from 'zustand'
import type { HomeSceneJSON } from '@/types/scene'
import { testScenes, type TestSceneId } from '@/data/testScenes'
import * as scenesApi from '@/api/scenes'

interface SceneState {
  homeScene: HomeSceneJSON | null
  setHomeScene: (scene: HomeSceneJSON | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
  fetchScene: (projectId: string) => Promise<void>
  clearScene: () => void
}

export const useSceneStore = create<SceneState>((set) => ({
  homeScene: null,

  setHomeScene: (scene) => set({ homeScene: scene }),

  loadTestScene: (sceneId) => {
    const scene = testScenes[sceneId]
    if (scene) {
      set({ homeScene: scene })
    }
  },

  fetchScene: async (projectId) => {
    const scene = await scenesApi.getScene(projectId)
    if (scene) {
      set({ homeScene: scene })
    }
  },

  clearScene: () => set({ homeScene: null }),
}))
