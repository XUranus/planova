export type ProjectStyle =
  | 'modern_luxury'
  | 'cream'
  | 'nordic'
  | 'chinese'
  | 'wabi_sabi'
  | 'industrial'

export type ProjectStatus = 'draft' | 'generating' | 'completed' | 'error'

export interface Project {
  id: string
  name: string
  description: string
  style: ProjectStyle
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export interface UploadedFile {
  id: string
  projectId: string
  fileName: string
  fileType: string
  fileSize: number
  previewUrl: string | null
  parseStatus: string
  createdAt: string
}

export const PROJECT_STYLES: { value: ProjectStyle; labelKey: string }[] = [
  { value: 'modern_luxury', labelKey: 'styles.modern_luxury' },
  { value: 'cream', labelKey: 'styles.cream' },
  { value: 'nordic', labelKey: 'styles.nordic' },
  { value: 'chinese', labelKey: 'styles.chinese' },
  { value: 'wabi_sabi', labelKey: 'styles.wabi_sabi' },
  { value: 'industrial', labelKey: 'styles.industrial' },
]
