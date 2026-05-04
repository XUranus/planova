import { create } from 'zustand'
import * as taskApi from '@/api/tasks'
import type { TaskInfo } from '@/api/tasks'

interface TaskState {
  activeTasks: Record<string, TaskInfo>

  startGeneration: (
    projectId: string,
    data: { fileId: string; style: string; ceilingHeight?: number; wallThickness?: number },
  ) => Promise<TaskInfo>
  pollTask: (taskId: string) => void
  stopPolling: (taskId: string) => void
  clearTask: (taskId: string) => void
}

const timers: Record<string, ReturnType<typeof setInterval>> = {}

export const useTaskStore = create<TaskState>((set, get) => ({
  activeTasks: {},

  startGeneration: async (projectId, data) => {
    const task = await taskApi.startGeneration(projectId, data)
    set((state) => ({
      activeTasks: { ...state.activeTasks, [task.id]: task },
    }))
    get().pollTask(task.id)
    return task
  },

  pollTask: (taskId) => {
    // Clear existing timer
    if (timers[taskId]) {
      clearInterval(timers[taskId])
    }

    timers[taskId] = setInterval(async () => {
      try {
        const task = await taskApi.getTask(taskId)
        set((state) => ({
          activeTasks: { ...state.activeTasks, [taskId]: task },
        }))

        if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
          get().stopPolling(taskId)
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 1500)
  },

  stopPolling: (taskId) => {
    if (timers[taskId]) {
      clearInterval(timers[taskId])
      delete timers[taskId]
    }
  },

  clearTask: (taskId) => {
    get().stopPolling(taskId)
    set((state) => {
      const activeTasks = { ...state.activeTasks }
      delete activeTasks[taskId]
      return { activeTasks }
    })
  },
}))
