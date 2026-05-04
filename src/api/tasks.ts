import { get, post } from './client'

interface TaskApi {
  id: string
  project_id: string
  task_type: string
  status: string
  progress: number
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  error_message: string
  created_at: string
  updated_at: string
}

export interface TaskInfo {
  id: string
  projectId: string
  taskType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  errorMessage: string
  createdAt: string
  updatedAt: string
}

function fromApi(t: TaskApi): TaskInfo {
  return {
    id: t.id,
    projectId: t.project_id,
    taskType: t.task_type,
    status: t.status as TaskInfo['status'],
    progress: t.progress,
    errorMessage: t.error_message,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }
}

export async function startGeneration(
  projectId: string,
  data: {
    fileId: string
    style: string
    ceilingHeight?: number
    wallThickness?: number
  },
): Promise<TaskInfo> {
  const res = await post<TaskApi>(`/api/projects/${projectId}/generate`, {
    file_id: data.fileId,
    style: data.style,
    ceiling_height: data.ceilingHeight,
    wall_thickness: data.wallThickness,
  })
  return fromApi(res)
}

export async function getTask(taskId: string): Promise<TaskInfo> {
  const res = await get<TaskApi>(`/api/tasks/${taskId}`)
  return fromApi(res)
}

export async function cancelTask(taskId: string): Promise<void> {
  await post(`/api/tasks/${taskId}/cancel`)
}
