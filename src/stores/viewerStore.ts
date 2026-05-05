import { create } from 'zustand'

export type ViewerMode = 'orbit' | 'walk' | 'edit'
export type TransformMode = 'translate' | 'rotate'

interface ViewerState {
  mode: ViewerMode
  selectedObjectId: string | null
  transformMode: TransformMode
  sceneUrl: string | null
  isLoading: boolean
  showCeilings: boolean

  setMode: (mode: ViewerMode) => void
  selectObject: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setSceneUrl: (url: string | null) => void
  setLoading: (loading: boolean) => void
  toggleCeilings: () => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  mode: 'orbit',
  selectedObjectId: null,
  transformMode: 'translate',
  sceneUrl: null,
  isLoading: false,
  showCeilings: true,

  setMode: (mode) => set({ mode, selectedObjectId: null }),
  selectObject: (id) => set({ selectedObjectId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setSceneUrl: (url) => set({ sceneUrl: url }),
  setLoading: (loading) => set({ isLoading: loading }),
  toggleCeilings: () => set((s) => ({ showCeilings: !s.showCeilings })),
}))
