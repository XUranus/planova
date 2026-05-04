import { get, del, uploadFile as upload, previewUrl as preview } from './client'
import type { UploadedFile } from '@/types/project'

interface FileApi {
  id: string
  project_id: string
  original_filename: string
  file_type: string
  file_size: number
  preview_url: string
  created_at: string
}

function fromApi(f: FileApi): UploadedFile {
  return {
    id: f.id,
    projectId: f.project_id,
    fileName: f.original_filename,
    fileType: f.file_type,
    fileSize: f.file_size,
    previewUrl: f.preview_url || null,
    createdAt: f.created_at,
  }
}

export async function uploadFile(projectId: string, file: File): Promise<UploadedFile> {
  const res = await upload(`/api/projects/${projectId}/files`, file)
  return fromApi(res as FileApi)
}

export async function getFiles(projectId: string): Promise<UploadedFile[]> {
  const res = await get<FileApi[]>(`/api/projects/${projectId}/files`)
  return res.map(fromApi)
}

export async function deleteFile(fileId: string): Promise<void> {
  await del(`/api/files/${fileId}`)
}

export function getPreviewUrl(fileId: string): string {
  return preview(fileId)
}
