import { create } from 'zustand'
import * as THREE from 'three'
import type { HomeSceneJSON } from '@/types/scene'
import type { BuiltObject } from '@/engine/buildObjects'
import { testScenes, type TestSceneId } from '@/data/testScenes'
import * as scenesApi from '@/api/scenes'
import type { SceneInfo } from '@/api/scenes'
import { retryParse as retryParseFile } from '@/api/files'

interface SceneState {
  // Multi-scene list
  scenes: SceneInfo[]
  activeSceneId: string | null

  // Currently loaded scene data for 3D viewer
  homeScene: HomeSceneJSON | null
  builtObjects: BuiltObject[]
  builtGroup: THREE.Group | null
  projectId: string | null

  // Review gate
  pendingReviewSceneId: string | null
  reviewSceneData: HomeSceneJSON | null
  reviewFileId: string | null
  isRetrying: boolean

  // JSON editor anti-loop: tracks last editor-originated change
  lastEditorChange: number

  setHomeScene: (scene: HomeSceneJSON | null, source?: 'editor' | '3d') => void
  setBuiltObjects: (objects: BuiltObject[]) => void
  setBuiltGroup: (group: THREE.Group | null) => void
  loadTestScene: (sceneId: TestSceneId) => void
  fetchScenes: (projectId: string) => Promise<void>
  loadScene: (sceneId: string) => Promise<void>
  acceptReview: () => void
  retryParse: (fileId: string) => Promise<void>
  saveScene: () => Promise<void>
  clearScene: () => void
}

const CLEAR_REVIEW = {
  pendingReviewSceneId: null,
  reviewSceneData: null,
  reviewFileId: null,
} as const

export const useSceneStore = create<SceneState>((set, get) => ({
  scenes: [],
  activeSceneId: null,
  homeScene: null,
  builtObjects: [],
  builtGroup: null,
  projectId: null,
  pendingReviewSceneId: null,
  reviewSceneData: null,
  reviewFileId: null,
  isRetrying: false,
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
      set({
        homeScene: scene,
        projectId: null,
        activeSceneId: null,
        scenes: [],
        ...CLEAR_REVIEW,
      })
    }
  },

  fetchScenes: async (projectId) => {
    const scenes = await scenesApi.listScenes(projectId)
    set({ scenes, projectId })
    const { activeSceneId } = get()
    if (activeSceneId || scenes.length === 0) return

    const sceneInfo = await scenesApi.getScene(scenes[0].id)
    if (!sceneInfo) return

    if (sceneInfo.sceneJson?.parse_quality?.needs_user_review) {
      set({
        pendingReviewSceneId: scenes[0].id,
        reviewSceneData: sceneInfo.sceneJson,
        reviewFileId: sceneInfo.fileId,
        projectId: sceneInfo.projectId,
      })
    } else {
      set({
        homeScene: sceneInfo.sceneJson,
        activeSceneId: scenes[0].id,
        projectId: sceneInfo.projectId,
        ...CLEAR_REVIEW,
      })
    }
  },

  loadScene: async (sceneId) => {
    const sceneInfo = await scenesApi.getScene(sceneId)
    if (sceneInfo) {
      set({
        homeScene: sceneInfo.sceneJson,
        activeSceneId: sceneId,
        projectId: sceneInfo.projectId,
        ...CLEAR_REVIEW,
      })
    }
  },

  acceptReview: () => {
    const { pendingReviewSceneId, reviewSceneData } = get()
    if (pendingReviewSceneId && reviewSceneData) {
      set({
        homeScene: reviewSceneData,
        activeSceneId: pendingReviewSceneId,
        ...CLEAR_REVIEW,
      })
    }
  },

  retryParse: async (fileId: string) => {
    set({ isRetrying: true })
    try {
      await retryParseFile(fileId)
      const { projectId } = get()
      if (projectId) {
        await get().fetchScenes(projectId)
      }
    } finally {
      set({ isRetrying: false })
    }
  },

  saveScene: async () => {
    const { homeScene, activeSceneId } = get()
    if (!homeScene || !activeSceneId) return
    await scenesApi.updateScene(activeSceneId, homeScene)
  },

  clearScene: () => set({
    homeScene: null,
    projectId: null,
    activeSceneId: null,
    scenes: [],
    ...CLEAR_REVIEW,
  }),
}))
