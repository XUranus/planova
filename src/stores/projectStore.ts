import { create } from 'zustand'
import type { Project, ProjectStyle, UploadedFile } from '@/types/project'
import * as projectsApi from '@/api/projects'
import * as filesApi from '@/api/files'

interface ProjectState {
  projects: Project[]
  currentProjectId: string | null
  files: Record<string, UploadedFile[]> // projectId -> files

  // API-backed
  fetchProjects: () => Promise<void>
  syncCreateProject: (data: { name: string; description: string; style: ProjectStyle }) => Promise<Project>
  syncDeleteProject: (id: string) => Promise<void>
  syncUploadFile: (projectId: string, file: File) => Promise<UploadedFile>
  syncDeleteFile: (projectId: string, fileId: string) => Promise<void>
  fetchFiles: (projectId: string) => Promise<void>

  // Local
  setCurrentProject: (id: string | null) => void
  getProject: (id: string) => Project | undefined
  getFiles: (projectId: string) => UploadedFile[]
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  files: {},

  fetchProjects: async () => {
    try {
      const projects = await projectsApi.getProjects()
      set({ projects })
    } catch {
      // Backend unavailable — keep local state
    }
  },

  syncCreateProject: async (data) => {
    const project = await projectsApi.createProject(data)
    set((state) => ({ projects: [...state.projects, project] }))
    return project
  },

  syncDeleteProject: async (id) => {
    await projectsApi.deleteProject(id)
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id)
      const files = { ...state.files }
      delete files[id]
      return {
        projects,
        files,
        currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
      }
    })
  },

  syncUploadFile: async (projectId, file) => {
    const uploaded = await filesApi.uploadFile(projectId, file)
    set((state) => {
      const projectFiles = state.files[projectId] || []
      return { files: { ...state.files, [projectId]: [...projectFiles, uploaded] } }
    })
    return uploaded
  },

  syncDeleteFile: async (projectId, fileId) => {
    await filesApi.deleteFile(fileId)
    set((state) => {
      const projectFiles = (state.files[projectId] || []).filter((f) => f.id !== fileId)
      return { files: { ...state.files, [projectId]: projectFiles } }
    })
  },

  fetchFiles: async (projectId) => {
    try {
      const files = await filesApi.getFiles(projectId)
      set((state) => ({ files: { ...state.files, [projectId]: files } }))
    } catch {
      // Keep local state
    }
  },

  setCurrentProject: (id) => set({ currentProjectId: id }),

  getProject: (id) => get().projects.find((p) => p.id === id),

  getFiles: (projectId) => get().files[projectId] || [],
}))
