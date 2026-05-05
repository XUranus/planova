import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, FolderOpen, Play, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'
import { useTaskStore } from '@/stores/taskStore'
import { toast } from '@/stores/toastStore'
import { DEMO_PROJECTS, isDemoProject, demoIdToSceneId } from '@/data/demoProjects'
import { SceneViewer } from '@/components/viewer/SceneViewer'
import { ViewerToolbar } from '@/components/viewer/ViewerToolbar'
import { MaterialPanel } from '@/components/viewer/MaterialPanel'
import { TexturePanel } from '@/components/viewer/TexturePanel'
import { getPreviewUrl } from '@/api/files'

export function ProjectDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const getFiles = useProjectStore((s) => s.getFiles)
  const fetchFiles = useProjectStore((s) => s.fetchFiles)
  const { loadTestScene, fetchScene, homeScene } = useSceneStore()
  const { activeTasks, startGeneration } = useTaskStore()

  const isDemo = id ? isDemoProject(id) : false
  const demoProject = isDemo ? DEMO_PROJECTS.find((d) => d.id === id) : undefined
  const project = isDemo ? demoProject : id ? getProject(id) : undefined
  const files = id ? getFiles(id) : []

  // Fetch files from backend on mount (skip for demo projects)
  useEffect(() => {
    if (!id) return
    if (isDemo) {
      const sceneId = demoIdToSceneId(id)
      if (sceneId) loadTestScene(sceneId)
      return
    }
    fetchFiles(id)
    fetchScene(id)
  }, [id, isDemo, fetchFiles, fetchScene, loadTestScene])

  // Find active task for this project
  const activeTask = useMemo(() => {
    return Object.values(activeTasks).find((t) => t.projectId === id)
  }, [activeTasks, id])

  // Show toast when task status changes
  useEffect(() => {
    if (!activeTask) return
    if (activeTask.status === 'completed') {
      toast.success(t('generate.completed'))
      if (id) fetchScene(id)
    }
    if (activeTask.status === 'failed') {
      toast.error(`${t('common.error')}: ${activeTask.errorMessage}`)
    }
  }, [activeTask?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!id || files.length === 0) return
    const file = files[0]
    try {
      toast.info(t('generate.progress'))
      await startGeneration(id, {
        fileId: file.id,
        style: project?.style || 'modern_luxury',
        ceilingHeight: 2.8,
        wallThickness: 0.2,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`${t('generate.failed')}: ${msg}`)
    }
  }

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
        <FolderOpen className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">Project not found</h2>
        <Button onClick={() => navigate('/')}>{t('nav.dashboard')}</Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {t(`styles.${project.style}`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isDemo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/projects/${id}/upload`)}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('project.upload')}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D Viewer */}
        <div className="relative flex-1">
          <SceneViewer />
          <ViewerToolbar />
          <MaterialPanel />
        </div>

        {/* Right info panel */}
        <div className="w-[280px] overflow-auto border-l p-4 space-y-4">
          {/* Floor plan thumbnail */}
          {files.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('project.floor_plan')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="relative aspect-[4/3] w-full overflow-hidden rounded border bg-muted cursor-pointer"
                  onClick={() => {
                    if (!homeScene && !isDemo && id) fetchScene(id)
                  }}
                >
                  <img
                    src={getPreviewUrl(files[0].id)}
                    alt={t('project.floor_plan')}
                    className="h-full w-full object-contain"
                  />
                  {!homeScene && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-muted-foreground">
                      {t('project.click_to_load')}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">{t('project.status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('project.style')}</span>
                <span>{t(`styles.${project.style}`)}</span>
              </div>
              {isDemo ? (
                <p className="text-xs text-muted-foreground">{t('demo.built_in_desc')}</p>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('upload.uploaded_files')}
                  </span>
                  <span>{files.length}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generate section — only for user projects */}
          {!isDemo && files.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Play className="h-3.5 w-3.5" />
                  {t('generate.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeTask ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      {activeTask.status === 'running' && (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      {activeTask.status === 'completed' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {activeTask.status === 'failed' && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span>
                        {activeTask.status === 'running' &&
                          `${t('generate.progress')} ${activeTask.progress}%`}
                        {activeTask.status === 'completed' && t('generate.completed')}
                        {activeTask.status === 'failed' && `${t('common.error')}: ${activeTask.errorMessage}`}
                        {activeTask.status === 'pending' && t('generate.pending')}
                      </span>
                    </div>
                    {activeTask.status === 'running' && (
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${activeTask.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handleGenerate}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {t('generate.start')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Texture selector — always visible when scene is loaded */}
          {homeScene && <TexturePanel />}
        </div>
      </div>
    </div>
  )
}
