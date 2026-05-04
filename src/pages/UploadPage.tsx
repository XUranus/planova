import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileImage, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectStore } from '@/stores/projectStore'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export function UploadPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const addFile = useProjectStore((s) => s.addFile)
  const removeFile = useProjectStore((s) => s.removeFile)
  const getFiles = useProjectStore((s) => s.getFiles)

  const project = id ? getProject(id) : undefined
  const files = id ? getFiles(id) : []

  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  const processFile = useCallback(
    (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t('upload.invalid_format'))
        return
      }

      if (file.size > MAX_SIZE) {
        setError(t('upload.file_too_large'))
        return
      }

      // Create preview URL for images
      let previewUrl: string | null = null
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file)
      }

      if (id) {
        const uploaded = addFile(id, {
          projectId: id,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          previewUrl,
        })
        if (previewUrl) {
          setPreviewUrls((prev) => ({ ...prev, [uploaded.id]: previewUrl }))
        }
      }
    },
    [id, addFile, t]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      droppedFiles.forEach(processFile)
    },
    [processFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])
      selectedFiles.forEach(processFile)
    },
    [processFile]
  )

  const handleRemove = (fileId: string) => {
    if (id) {
      removeFile(id, fileId)
      if (previewUrls[fileId]) {
        URL.revokeObjectURL(previewUrls[fileId])
        setPreviewUrls((prev) => {
          const next = { ...prev }
          delete next[fileId]
          return next
        })
      }
    }
  }

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <h2 className="mb-2 text-lg font-semibold">Project not found</h2>
        <Button onClick={() => navigate('/')}>{t('nav.dashboard')}</Button>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{t('upload.title')}</h1>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        )}
      >
        <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="mb-1 text-sm font-medium">{t('upload.dropzone')}</p>
        <p className="mb-4 text-xs text-muted-foreground">{t('upload.supported_formats')}</p>
        <label>
          <input
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            onChange={handleFileInput}
          />
          <Button asChild variant="outline" size="sm">
            <span>{t('upload.dropzone')}</span>
          </Button>
        </label>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('upload.uploaded_files')}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => (
              <Card key={file.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <FileImage className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{file.fileName}</span>
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(file.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {file.previewUrl && (
                    <img
                      src={file.previewUrl}
                      alt={file.fileName}
                      className="mb-2 h-32 w-full rounded-md object-cover"
                    />
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{file.fileType}</span>
                    <span>{(file.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
