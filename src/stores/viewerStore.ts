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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orbitControls: any | null
  resetCameraToken: number
  hoveredCategory: string | null
  hoverScreenPos: { x: number; y: number } | null

  setMode: (mode: ViewerMode) => void
  selectObject: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setSceneUrl: (url: string | null) => void
  setLoading: (loading: boolean) => void
  toggleCeilings: () => void
  setOrbitControls: (controls: any | null) => void
  requestResetCamera: () => void
  setHoveredObject: (category: string | null, pos: { x: number; y: number } | null) => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  mode: 'orbit',
  selectedObjectId: null,
  transformMode: 'translate',
  sceneUrl: null,
  isLoading: false,
  showCeilings: true,
  orbitControls: null,
  resetCameraToken: 0,
  hoveredCategory: null,
  hoverScreenPos: null,

  setMode: (mode) => set({ mode, selectedObjectId: null }),
  selectObject: (id) => set({ selectedObjectId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setSceneUrl: (url) => set({ sceneUrl: url }),
  setLoading: (loading) => set({ isLoading: loading }),
  toggleCeilings: () => set((s) => ({ showCeilings: !s.showCeilings })),
  setOrbitControls: (controls) => set({ orbitControls: controls }),
  requestResetCamera: () => set((s) => ({ resetCameraToken: s.resetCameraToken + 1 })),
  setHoveredObject: (category, pos) => set({ hoveredCategory: category, hoverScreenPos: pos }),
}))
