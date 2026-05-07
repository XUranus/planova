import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Upload, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'
import { DEMO_PROJECTS, isDemoProject, demoIdToSceneId } from '@/data/demoProjects'
import { SceneViewer } from '@/components/viewer/SceneViewer'
import { ViewerToolbar } from '@/components/viewer/ViewerToolbar'
import { MaterialPanel } from '@/components/viewer/MaterialPanel'
import { RightPanel } from '@/components/viewer/RightPanel'
import type { ProjectStyle } from '@/types/project'
import { PROJECT_STYLES } from '@/types/project'

export function ProjectDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const getProject = useProjectStore((s) => s.getProject)
  const getFiles = useProjectStore((s) => s.getFiles)
  const fetchFiles = useProjectStore((s) => s.fetchFiles)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const syncUpdateProject = useProjectStore((s) => s.syncUpdateProject)
  const projects = useProjectStore((s) => s.projects)
  const { loadTestScene, fetchScenes, scenes } = useSceneStore()

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStyle, setEditStyle] = useState<ProjectStyle>('modern_luxury')

  const [panelWidth, setPanelWidth] = useState(380)
  const panelWidthRef = useRef(panelWidth)
  const viewerRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = panelWidthRef.current
    let rafId = 0

    const applyWidth = (w: number) => {
      panelWidthRef.current = w
      if (viewerRef.current) viewerRef.current.style.width = `calc(100% - ${w + 4}px)`
      if (rightPanelRef.current) rightPanelRef.current.style.width = `${w}px`
    }

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const delta = startX - e.clientX
        const maxWidth = window.innerWidth * 0.5
        const newWidth = Math.min(maxWidth, Math.max(280, startWidth + delta))
        applyWidth(newWidth)
      })
    }

    const onMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setPanelWidth(panelWidthRef.current)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

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

  // When scene count changes, refresh both scenes and files
  useEffect(() => {
    if (!isDemo && id) {
      fetchScenes(id)
      fetchFiles(id)
    }
  }, [scenes.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detect completed files with no matching scene → refresh scenes
  const prevCompletedCountRef = useRef(0)
  useEffect(() => {
    if (isDemo || !id) return
    const completedCount = files.filter((f) => f.parseStatus === 'completed').length
    const hasNewCompleted = completedCount > prevCompletedCountRef.current
    prevCompletedCountRef.current = completedCount
    if (hasNewCompleted) {
      fetchScenes(id)
    }
  }, [files, isDemo, id, fetchScenes])

  // Show loading while fetching project data
  if (!project && !isDemo) {
    return null
  }

  if (!project) {
    return null
  }

  const openEditDialog = () => {
    setEditName(project.name)
    setEditDesc(project.description)
    setEditStyle(project.style as ProjectStyle)
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!id || !editName.trim()) return
    await syncUpdateProject(id, {
      name: editName.trim(),
      description: editDesc.trim(),
      style: editStyle,
    })
    setEditOpen(false)
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
          {!isDemo && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openEditDialog}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
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
        <div ref={viewerRef} className="relative min-w-0" style={{ width: `calc(100% - ${panelWidth + 4}px)` }}>
          <SceneViewer />
          <ViewerToolbar />
          <MaterialPanel />
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary transition-colors"
          onMouseDown={handleResizeStart}
        />

        {/* Right panel with tabs */}
        <RightPanel panelRef={rightPanelRef} isDemo={isDemo} projectId={id} projectStyle={project.style} width={panelWidth} />
      </div>

      {/* Edit project dialog */}
      {!isDemo && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('edit_dialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.name_label')}</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('create_dialog.name_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.description_label')}</label>
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder={t('create_dialog.description_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.style_label')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setEditStyle(style.value)}
                      className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                        editStyle === style.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent'
                      }`}
                    >
                      {t(style.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveEdit} disabled={!editName.trim()}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
