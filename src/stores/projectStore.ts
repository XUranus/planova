import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Project, ProjectStyle, UploadedFile } from '@/types/project'
import * as projectsApi from '@/api/projects'
import * as filesApi from '@/api/files'

interface ProjectState {
  projects: Project[]
  currentProjectId: string | null
  files: Record<string, UploadedFile[]> // projectId -> files

  // API-backed (falls back to local if backend unavailable)
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

function createLocalProject(data: { name: string; description: string; style: ProjectStyle }): Project {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name: data.name,
    description: data.description,
    style: data.style,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

function createLocalFile(projectId: string, file: File): UploadedFile {
  return {
    id: uuidv4(),
    projectId,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    previewUrl: URL.createObjectURL(file),
    createdAt: new Date().toISOString(),
  }
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
    try {
      const project = await projectsApi.createProject(data)
      set((state) => ({ projects: [...state.projects, project] }))
      return project
    } catch {
      // Fallback: create locally
      const project = createLocalProject(data)
      set((state) => ({ projects: [...state.projects, project] }))
      return project
    }
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
    try {
      const uploaded = await filesApi.uploadFile(projectId, file)
      set((state) => {
        const projectFiles = state.files[projectId] || []
        return { files: { ...state.files, [projectId]: [...projectFiles, uploaded] } }
      })
      return uploaded
    } catch {
      // Fallback: create local file entry
      const localFile = createLocalFile(projectId, file)
      set((state) => {
        const projectFiles = state.files[projectId] || []
        return { files: { ...state.files, [projectId]: [...projectFiles, localFile] } }
      })
      return localFile
    }
  },

  syncDeleteFile: async (projectId, fileId) => {
    try {
      await filesApi.deleteFile(fileId)
    } catch {
      // Local delete even if API fails
    }
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
