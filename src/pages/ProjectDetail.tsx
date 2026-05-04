import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, FolderOpen, Box, Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'
import { useTaskStore } from '@/stores/taskStore'
import type { TestSceneId } from '@/data/testScenes'
import { SceneViewer } from '@/components/viewer/SceneViewer'
import { ViewerToolbar } from '@/components/viewer/ViewerToolbar'
import { MaterialPanel } from '@/components/viewer/MaterialPanel'

const demoScenes: { id: TestSceneId; labelKey: string }[] = [
  { id: 'studio', labelKey: 'demo.studio' },
  { id: 'twoBedroom', labelKey: 'demo.two_bedroom' },
]

export function ProjectDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const getFiles = useProjectStore((s) => s.getFiles)
  const fetchFiles = useProjectStore((s) => s.fetchFiles)
  const { homeScene, loadTestScene, clearScene, fetchScene } = useSceneStore()
  const { activeTasks, startGeneration } = useTaskStore()

  const project = id ? getProject(id) : undefined
  const files = id ? getFiles(id) : []

  // Fetch files from backend on mount
  useEffect(() => {
    if (id) {
      fetchFiles(id)
      fetchScene(id)
    }
  }, [id, fetchFiles, fetchScene])

  // Find active task for this project
  const activeTask = useMemo(() => {
    return Object.values(activeTasks).find((t) => t.projectId === id)
  }, [activeTasks, id])

  const handleGenerate = async () => {
    if (!id || files.length === 0) return
    const file = files[0] // Use first uploaded file
    try {
      const task = await startGeneration(id, {
        fileId: file.id,
        style: project?.style || 'modern_luxury',
        ceilingHeight: 2.8,
        wallThickness: 0.2,
      })
      // Poll for task completion — scene will be fetched when task completes
      const unsub = useTaskStore.subscribe((state) => {
        const t = state.activeTasks[task.id]
        if (t?.status === 'completed') {
          fetchScene(id)
          unsub()
        }
        if (t?.status === 'failed') {
          unsub()
        }
      })
    } catch {
      // Error handled by task store
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/projects/${id}/upload`)}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t('project.upload')}
          </Button>
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
        <div className="w-[280px] overflow-auto border-l p-4">
          {/* Project info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('project.status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('project.style')}</span>
                <span>{t(`styles.${project.style}`)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('upload.uploaded_files')}
                </span>
                <span>{files.length}</span>
              </div>
            </CardContent>
          </Card>

          {/* Generate section */}
          {files.length > 0 && (
            <>
              <Separator className="my-4" />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Play className="h-4 w-4" />
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
            </>
          )}

          <Separator className="my-4" />

          {/* Demo scenes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Box className="h-4 w-4" />
                {t('demo.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {demoScenes.map((scene) => (
                <Button
                  key={scene.id}
                  variant={
                    homeScene?.project.id ===
                    (scene.id === 'studio' ? 'test_studio' : 'test_2br')
                      ? 'default'
                      : 'outline'
                  }
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => loadTestScene(scene.id)}
                >
                  {t(scene.labelKey)}
                </Button>
              ))}
              {homeScene && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={clearScene}
                >
                  {t('demo.clear')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
