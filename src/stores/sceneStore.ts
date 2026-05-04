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

  setHomeScene: (scene: HomeSceneJSON | null) => void
  setBuiltObjects: (objects: BuiltObject[]) => void
  setBuiltGroup: (group: THREE.Group | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
  fetchScene: (projectId: string) => Promise<void>
  clearScene: () => void
}

export const useSceneStore = create<SceneState>((set) => ({
  homeScene: null,
  builtObjects: [],
  builtGroup: null,

  setHomeScene: (scene) => set({ homeScene: scene }),
  setBuiltObjects: (objects) => set({ builtObjects: objects }),
  setBuiltGroup: (group) => set({ builtGroup: group }),

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
