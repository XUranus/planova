import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, Image as ImageIcon, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'
import { toast } from '@/stores/toastStore'
import { DEMO_PROJECTS, isDemoProject, demoIdToSceneId } from '@/data/demoProjects'
import { SceneViewer } from '@/components/viewer/SceneViewer'
import { ViewerToolbar } from '@/components/viewer/ViewerToolbar'
import { MaterialPanel } from '@/components/viewer/MaterialPanel'
import { TexturePanel } from '@/components/viewer/TexturePanel'
import { cn } from '@/lib/utils'

export function ProjectDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const getFiles = useProjectStore((s) => s.getFiles)
  const fetchFiles = useProjectStore((s) => s.fetchFiles)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const projects = useProjectStore((s) => s.projects)
  const { loadTestScene, fetchScenes, homeScene, scenes, activeSceneId, loadScene } = useSceneStore()

  const isDemo = id ? isDemoProject(id) : false
  const demoProject = isDemo ? DEMO_PROJECTS.find((d) => d.id === id) : undefined
  const project = isDemo ? demoProject : id ? getProject(id) : undefined
  const files = id ? getFiles(id) : []

  // Count files being parsed
  const parsingCount = useMemo(
    () => files.filter((f) => f.parseStatus === 'parsing' || f.parseStatus === '').length,
    [files],
  )

  // Fetch files and scenes on mount
  useEffect(() => {
    if (!id) return
    if (isDemo) {
      const sceneId = demoIdToSceneId(id)
      if (sceneId) loadTestScene(sceneId)
      return
    }
    fetchFiles(id)
    fetchScenes(id)
  }, [id, isDemo, fetchFiles, fetchScenes, loadTestScene])

  // Fetch projects if store is empty (e.g. after page refresh)
  useEffect(() => {
    if (!isDemo && projects.length === 0) {
      fetchProjects()
    }
  }, [isDemo, projects.length, fetchProjects])

  // Redirect to dashboard if project truly doesn't exist (after loading)
  useEffect(() => {
    if (!isDemo && id && projects.length > 0 && !getProject(id)) {
      navigate('/', { replace: true })
    }
  }, [isDemo, id, projects, getProject, navigate])

  // Show toast when scenes update (new scene parsed)
  useEffect(() => {
    if (!isDemo && scenes.length > 0 && id) {
      // Refresh files to get updated parse_status
      fetchFiles(id)
    }
  }, [scenes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Find the file for the active scene's thumbnail
  const activeFile = useMemo(() => {
    if (!activeSceneId) return null
    const activeScene = scenes.find((s) => s.id === activeSceneId)
    if (!activeScene?.fileId) return null
    return files.find((f) => f.id === activeScene.fileId) || null
  }, [activeSceneId, scenes, files])

  // Show loading while fetching project data
  if (!project && !isDemo) {
    return null
  }

  if (!project) {
    return null
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
              className="relative"
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('project.upload')}
              {parsingCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {parsingCount}
                </span>
              )}
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
        <div className="w-[380px] shrink-0 overflow-auto border-l p-4 space-y-4 scrollbar-thin">
          {/* Scenes list — for user projects with parsed scenes */}
          {!isDemo && scenes.length > 0 && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                  <Layers className="h-3.5 w-3.5" />
                  {t('project.scenes')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 px-3 pb-3">
                {scenes.map((scene) => {
                  const isActive = scene.id === activeSceneId
                  const sceneFile = files.find((f) => f.id === scene.fileId)
                  return (
                    <button
                      key={scene.id}
                      onClick={() => loadScene(scene.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all',
                        isActive
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-accent',
                      )}
                    >
                      {sceneFile?.previewUrl ? (
                        <img
                          src={sceneFile.previewUrl}
                          alt={scene.name}
                          className="h-10 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-12 shrink-0 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{scene.name || scene.id.slice(0, 8)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(scene.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Floor plan thumbnail for active scene */}
          {activeFile && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t('project.floor_plan')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="aspect-[4/3] w-full overflow-hidden rounded border bg-muted">
                  <img
                    src={activeFile.previewUrl || ''}
                    alt={t('project.floor_plan')}
                    className="h-full w-full object-contain"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Project info */}
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-xs font-medium">{t('project.status')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('project.style')}</span>
                <span>{t(`styles.${project.style}`)}</span>
              </div>
              {isDemo ? (
                <p className="text-xs text-muted-foreground">{t('demo.built_in_desc')}</p>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('upload.uploaded_files')}</span>
                    <span>{files.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('project.scenes')}</span>
                    <span>{scenes.length}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Texture selector — always visible when scene is loaded */}
          {homeScene && <TexturePanel />}
        </div>
      </div>
    </div>
  )
}
