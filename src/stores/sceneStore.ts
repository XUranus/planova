import { create } from 'zustand'
import type { HomeSceneJSON } from '@/types/scene'
import { testScenes, type TestSceneId } from '@/data/testScenes'

interface SceneState {
  homeScene: HomeSceneJSON | null
  setHomeScene: (scene: HomeSceneJSON | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
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

  clearScene: () => set({ homeScene: null }),
}))
