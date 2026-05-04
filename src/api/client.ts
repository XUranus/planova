const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export interface ApiError extends Error {
  status: number
}

function createApiError(status: number, message: string): ApiError {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  err.name = 'ApiError'
  return err as ApiError
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw createApiError(res.status, body || res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export function get<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function patch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export async function uploadFile(
  path: string,
  file: File,
): Promise<unknown> {
  const url = `${BASE_URL}${path}`
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(url, { method: 'POST', body: formData })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw createApiError(res.status, body || res.statusText)
  }
  return res.json()
}

export function previewUrl(fileId: string): string {
  return `${BASE_URL}/api/files/${fileId}/preview`
}
