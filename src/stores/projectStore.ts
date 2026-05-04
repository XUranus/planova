import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Project, ProjectStyle, UploadedFile } from '@/types/project'

interface ProjectState {
  projects: Project[]
  currentProjectId: string | null
  files: Record<string, UploadedFile[]> // projectId -> files

  // Project CRUD
  createProject: (data: { name: string; description: string; style: ProjectStyle }) => Project
  deleteProject: (id: string) => void
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'style' | 'status'>>) => void
  setCurrentProject: (id: string | null) => void
  getProject: (id: string) => Project | undefined

  // File management
  addFile: (projectId: string, file: Omit<UploadedFile, 'id' | 'createdAt'>) => UploadedFile
  removeFile: (projectId: string, fileId: string) => void
  getFiles: (projectId: string) => UploadedFile[]

  // Persistence
  hydrate: () => void
}

const STORAGE_KEY = 'planova-projects'
const FILES_KEY = 'planova-files'

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  files: {},

  createProject: (data) => {
    const now = new Date().toISOString()
    const project: Project = {
      id: uuidv4(),
      name: data.name,
      description: data.description,
      style: data.style,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }
    set((state) => {
      const projects = [...state.projects, project]
      saveToStorage(STORAGE_KEY, projects)
      return { projects }
    })
    return project
  },

  deleteProject: (id) => {
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id)
      const files = { ...state.files }
      delete files[id]
      saveToStorage(STORAGE_KEY, projects)
      saveToStorage(FILES_KEY, files)
      return {
        projects,
        files,
        currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
      }
    })
  },

  updateProject: (id, data) => {
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
      )
      saveToStorage(STORAGE_KEY, projects)
      return { projects }
    })
  },

  setCurrentProject: (id) => set({ currentProjectId: id }),

  getProject: (id) => get().projects.find((p) => p.id === id),

  addFile: (projectId, fileData) => {
    const file: UploadedFile = {
      ...fileData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    }
    set((state) => {
      const projectFiles = state.files[projectId] || []
      const files = { ...state.files, [projectId]: [...projectFiles, file] }
      saveToStorage(FILES_KEY, files)
      return { files }
    })
    return file
  },

  removeFile: (projectId, fileId) => {
    set((state) => {
      const projectFiles = (state.files[projectId] || []).filter((f) => f.id !== fileId)
      const files = { ...state.files, [projectId]: projectFiles }
      saveToStorage(FILES_KEY, files)
      return { files }
    })
  },

  getFiles: (projectId) => get().files[projectId] || [],

  hydrate: () => {
    const projects = loadFromStorage<Project[]>(STORAGE_KEY, [])
    const files = loadFromStorage<Record<string, UploadedFile[]>>(FILES_KEY, {})
    set({ projects, files })
  },
}))
