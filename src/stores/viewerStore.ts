import { create } from 'zustand'

export type ViewerMode = 'orbit' | 'walk' | 'edit'

interface ViewerState {
  mode: ViewerMode
  selectedObjectId: string | null
  sceneUrl: string | null
  isLoading: boolean

  setMode: (mode: ViewerMode) => void
  selectObject: (id: string | null) => void
  setSceneUrl: (url: string | null) => void
  setLoading: (loading: boolean) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  mode: 'orbit',
  selectedObjectId: null,
  sceneUrl: null,
  isLoading: false,

  setMode: (mode) => set({ mode }),
  selectObject: (id) => set({ selectedObjectId: id }),
  setSceneUrl: (url) => set({ sceneUrl: url }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
