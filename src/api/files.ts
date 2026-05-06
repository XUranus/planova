import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { UploadedFile } from '@/types/project'

interface FileApi {
  id: string
  project_id: string
  original_filename: string
  file_type: string
  file_size: number
  preview_url: string
  parse_status: string
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
    parseStatus: f.parse_status || '',
    createdAt: f.created_at,
  }
}

/**
 * Upload via native file dialog (button click flow).
 * Opens a native file picker, then passes the local path to Rust.
 */
export async function uploadFileViaDialog(projectId: string): Promise<UploadedFile | null> {
  const selected = await open({
    multiple: false,
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (!selected) return null

  const filePath = typeof selected === 'string' ? selected : selected.path
  const res = await invoke<FileApi>('upload_file', { projectId, filePath })
  return fromApi(res)
}

/**
 * Upload a browser File object (from drag-and-drop or file input).
 * Reads bytes in the webview, sends as base64 to Rust.
 */
export async function uploadFileObject(projectId: string, file: File): Promise<UploadedFile> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const base64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))

  const res = await invoke<FileApi>('upload_file_from_base64', {
    projectId,
    base64Data: base64,
    filename: file.name,
  })
  return fromApi(res)
}

export async function getFiles(projectId: string): Promise<UploadedFile[]> {
  const res = await invoke<FileApi[]>('list_files', { projectId })
  return res.map(fromApi)
}

export async function deleteFile(fileId: string): Promise<void> {
  await invoke('delete_file', { fileId })
}

export async function getFilePreview(fileId: string): Promise<string> {
  return invoke<string>('get_file_preview', { fileId })
}

export async function retryParse(fileId: string): Promise<void> {
  await invoke('retry_parse', { fileId })
}
