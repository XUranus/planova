import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileImage, Trash2, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectStore } from '@/stores/projectStore'
import { retryParse } from '@/api/files'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export function UploadPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const syncUploadFile = useProjectStore((s) => s.syncUploadFile)
  const syncDeleteFile = useProjectStore((s) => s.syncDeleteFile)
  const fetchFiles = useProjectStore((s) => s.fetchFiles)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (id) fetchFiles(id)
  }, [id, fetchFiles])

  // Poll for parse status updates while any file is parsing
  const files = useProjectStore((s) => (id ? s.files[id] || [] : []))
  const hasParsing = files.some((f) => f.parseStatus === 'parsing' || f.parseStatus === '')

  useEffect(() => {
    if (!id || !hasParsing) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = setInterval(() => {
      fetchFiles(id)
    }, 2000)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [id, hasParsing, fetchFiles])

  const project = id ? getProject(id) : undefined

  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [retrying, setRetrying] = useState<Record<string, boolean>>({})

  const processFile = useCallback(
    async (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t('upload.invalid_format'))
        return
      }

      if (file.size > MAX_SIZE) {
        setError(t('upload.file_too_large'))
        return
      }

      if (!id) return

      setUploading(true)
      try {
        await syncUploadFile(id, file)
        // Refresh files to get parse status
        setTimeout(() => fetchFiles(id), 500)
      } catch {
        setError(t('common.error'))
      } finally {
        setUploading(false)
      }
    },
    [id, syncUploadFile, fetchFiles, t],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      droppedFiles.forEach(processFile)
    },
    [processFile],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])
      selectedFiles.forEach(processFile)
    },
    [processFile],
  )

  const handleRemove = async (fileId: string) => {
    if (id) {
      try {
        await syncDeleteFile(id, fileId)
      } catch {
        setError(t('common.error'))
      }
    }
  }

  const handleRetry = async (fileId: string) => {
    setRetrying((s) => ({ ...s, [fileId]: true }))
    try {
      await retryParse(fileId)
      if (id) await fetchFiles(id)
    } catch {
      setError(t('common.error'))
    } finally {
      setRetrying((s) => ({ ...s, [fileId]: false }))
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
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-all',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        {uploading ? (
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" />
        ) : (
          <Upload className={cn(
            'mb-4 h-10 w-10 transition-colors',
            isDragging ? 'text-primary' : 'text-muted-foreground',
          )} />
        )}
        <p className="mb-1 text-sm font-medium">
          {uploading ? t('common.loading') : t('upload.dropzone')}
        </p>
        <p className="mb-4 text-xs text-muted-foreground">{t('upload.supported_formats')}</p>
        <label>
          <input
            type="file"
            className="hidden"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            onChange={handleFileInput}
            disabled={uploading}
          />
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <span>{t('upload.dropzone')}</span>
          </Button>
        </label>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Uploaded files list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t('upload.uploaded_files')}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {files.map((file) => {
              const isParsing = file.parseStatus === 'parsing' || file.parseStatus === ''
              const isCompleted = file.parseStatus === 'completed'
              const isFailed = file.parseStatus === 'failed'

              return (
                <Card key={file.id} className="relative overflow-hidden">
                  {/* Parse status overlay */}
                  {isParsing && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">{t('upload.parsing')}</span>
                    </div>
                  )}
                  {isFailed && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
                      <AlertCircle className="mb-2 h-6 w-6 text-destructive" />
                      <span className="mb-2 text-xs text-destructive">{t('upload.parse_failed')}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleRetry(file.id)}
                        disabled={retrying[file.id]}
                      >
                        {retrying[file.id] ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3 w-3" />
                        )}
                        {t('upload.retry')}
                      </Button>
                    </div>
                  )}

                  <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <FileImage className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{file.fileName}</span>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      {isCompleted && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemove(file.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <img
                      src={file.previewUrl || ''}
                      alt={file.fileName}
                      className="mb-3 h-32 w-full rounded-md object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5">{file.fileType}</span>
                      <span>{(file.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
