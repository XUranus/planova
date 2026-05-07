import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Layers, SlidersHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TexturePanel } from '@/components/viewer/TexturePanel'
import { SceneInspector } from '@/components/viewer/SceneInspector'
import { useSceneStore } from '@/stores/sceneStore'
import { useProjectStore } from '@/stores/projectStore'
import { cn } from '@/lib/utils'

interface RightPanelProps {
  isDemo: boolean
  projectId: string | undefined
  projectStyle: string
  width?: number
  panelRef?: React.RefObject<HTMLDivElement | null>
}

export function RightPanel({ isDemo, projectId, projectStyle, width = 380, panelRef }: RightPanelProps) {
  const { t } = useTranslation()
  const { scenes, activeSceneId, loadScene, homeScene } = useSceneStore()
  const getFiles = useProjectStore((s) => s.getFiles)
  const files = projectId ? getFiles(projectId) : []

  const activeFile = (() => {
    if (!activeSceneId) return null
    const activeScene = scenes.find((s) => s.id === activeSceneId)
    if (!activeScene?.fileId) return null
    return files.find((f) => f.id === activeScene.fileId) || null
  })()

  return (
    <div ref={panelRef} className="shrink-0 overflow-hidden border-l" style={{ width }}>
      <Tabs defaultValue="inspector" className="flex h-full flex-col">
        <div className="border-b px-3 py-2">
          <TabsList className="h-8 w-full">
            <TabsTrigger value="scenes" className="gap-1.5 px-3 text-xs flex-1">
              <Layers className="h-3.5 w-3.5" />
              {t('editor.tab_scenes')}
            </TabsTrigger>
            <TabsTrigger value="inspector" className="gap-1.5 px-3 text-xs flex-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('inspector.tab')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="scenes" className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin mt-0">
          {/* Scenes list */}
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

          {/* Floor plan thumbnail */}
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
                <span>{t(`styles.${projectStyle}`)}</span>
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

          {/* Texture selector */}
          {homeScene && <TexturePanel />}
        </TabsContent>

        <TabsContent value="inspector" className="flex-1 min-h-0 mt-0">
          <SceneInspector />
        </TabsContent>
      </Tabs>
    </div>
  )
}
