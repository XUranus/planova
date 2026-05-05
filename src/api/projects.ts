import { invoke } from '@tauri-apps/api/core'
import type { Project, ProjectStyle } from '@/types/project'

interface ProjectApi {
  id: string
  name: string
  description: string
  style: string
  status: string
  created_at: string
  updated_at: string
}

function fromApi(p: ProjectApi): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    style: p.style as ProjectStyle,
    status: p.status as Project['status'],
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

export async function createProject(data: {
  name: string
  description: string
  style: ProjectStyle
}): Promise<Project> {
  const res = await invoke<ProjectApi>('create_project', {
    name: data.name,
    description: data.description,
    style: data.style,
  })
  return fromApi(res)
}

export async function getProjects(): Promise<Project[]> {
  const res = await invoke<ProjectApi[]>('list_projects')
  return res.map(fromApi)
}

export async function getProject(id: string): Promise<Project> {
  const res = await invoke<ProjectApi>('get_project', { projectId: id })
  return fromApi(res)
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, 'name' | 'description' | 'style' | 'status'>>,
): Promise<Project> {
  const res = await invoke<ProjectApi>('update_project', {
    projectId: id,
    name: data.name ?? null,
    description: data.description ?? null,
    style: data.style ?? null,
    status: data.status ?? null,
  })
  return fromApi(res)
}

export async function deleteProject(id: string): Promise<void> {
  await invoke('delete_project', { projectId: id })
}
