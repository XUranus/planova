import { useRef, useCallback, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RotateCcw, Camera, FolderOpen, Move3D, Orbit, Pencil,
  Move, RotateCw, Trash2, Download, Eye, EyeOff, Sparkles, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useViewerStore } from '@/stores/viewerStore'
import { useSceneStore } from '@/stores/sceneStore'
import { deleteObject } from '@/engine/deleteObject'
import { invoke } from '@tauri-apps/api/core'
import { exportToGLB } from '@/engine/exportScene'
import { toast } from '@/stores/toastStore'
import { exportRender } from '@/api/settings'

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function openFileWithViewer(filePath: string) {
  const { Command } = await import('@tauri-apps/plugin-shell')
  const cmd = Command.create('open-file', ['xdg-open', filePath])
  await cmd.execute()
}

/**
 * Save a Blob to disk using Rust command, then open it with the system viewer.
 */
async function saveBlob(blob: Blob, defaultName: string) {
  const { save } = await import('@tauri-apps/plugin-dialog')

  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: defaultName.split('.').pop()?.toUpperCase() || 'File', extensions: [defaultName.split('.').pop() || ''] }],
  })
  if (!filePath) return

  const b64 = await blobToBase64(blob)
  await invoke('save_file', { path: filePath, base64Data: b64 })
  await openFileWithViewer(filePath)
}

/**
 * Save a base64 image to a user-chosen path and open it.
 */
async function saveAndOpenBase64(b64: string, filename: string) {
  const { save } = await import('@tauri-apps/plugin-dialog')

  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  if (!filePath) return

  await invoke('save_file', { path: filePath, base64Data: b64 })
  await openFileWithViewer(filePath)
}

export function ViewerToolbar() {
  const { t } = useTranslation()
  const { mode, setMode, setSceneUrl, transformMode, setTransformMode, selectedObjectId, showCeilings, toggleCeilings, requestResetCamera } = useViewerStore()
  const builtGroup = useSceneStore((s) => s.builtGroup)
  const homeScene = useSceneStore((s) => s.homeScene)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rendering, setRendering] = useState(false)
  const [renderDialogOpen, setRenderDialogOpen] = useState(false)
  const [renderPrompt, setRenderPrompt] = useState('')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire if user is typing in an input/textarea/contentEditable
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.target as HTMLElement)?.isContentEditable) return
      // Don't fire with modifier keys (let Ctrl+C, Alt+R, etc. pass through)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case '1':
          setMode('orbit')
          break
        case '2':
          setMode('walk')
          break
        case '3':
          setMode('edit')
          break
        case 'c':
        case 'C':
          if (homeScene) toggleCeilings()
          break
        case 'r':
        case 'R':
          e.preventDefault()
          requestResetCamera()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [homeScene, setMode, toggleCeilings, requestResetCamera])

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        const url = URL.createObjectURL(file)
        setSceneUrl(url)
      }
    },
    [setSceneUrl]
  )

  const handleScreenshot = useCallback(async () => {
    // Find the R3F WebGL canvas by checking for a WebGL context
    const canvases = document.querySelectorAll('canvas')
    let target: HTMLCanvasElement | null = null
    for (const c of canvases) {
      if (c.getContext('webgl2') || c.getContext('webgl')) {
        target = c
        break
      }
    }
    if (!target) {
      toast.error('Screenshot: no canvas found')
      return
    }
    const dataUrl = target.toDataURL('image/png')
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    await saveBlob(blob, `planova-screenshot-${Date.now()}.png`)
  }, [])

  const STYLE_PROMPTS: Record<string, string> = {
    modern_luxury: 'Modern luxury interior with marble, gold accents, sleek furniture, and warm ambient lighting',
    cream: 'Cream-toned interior with soft neutrals, rounded furniture, plush textures, and warm natural light',
    nordic: 'Nordic Scandinavian interior with light wood, white walls, minimal furniture, and natural daylight',
    chinese: 'New Chinese style with dark wood lattice, ink paintings, silk textures, and traditional-modern fusion',
    wabi_sabi: 'Wabi-sabi interior with raw concrete, imperfect ceramics, natural wood grain, and earthy tones',
    industrial: 'Industrial style with exposed brick, steel beams, concrete floors, Edison bulbs, and raw materials',
  }

  const openRenderDialog = useCallback(() => {
    const style = homeScene?.global?.style || 'modern_luxury'
    setRenderPrompt(STYLE_PROMPTS[style] || STYLE_PROMPTS.modern_luxury)
    setRenderDialogOpen(true)
  }, [homeScene])

  const handleRenderExport = useCallback(async (customPrompt?: string) => {
    const canvases = document.querySelectorAll('canvas')
    let target: HTMLCanvasElement | null = null
    for (const c of canvases) {
      if (c.getContext('webgl2') || c.getContext('webgl')) {
        target = c
        break
      }
    }
    if (!target) {
      toast.error('Render: no canvas found')
      return
    }

    const style = homeScene?.global?.style || 'modern_luxury'
    const dataUrl = target.toDataURL('image/png')

    setRendering(true)
    setRenderDialogOpen(false)
    toast.info(t('viewer.render_exporting'))
    try {
      const result = await exportRender(dataUrl, style, customPrompt)
      if (result.success && result.render_base64) {
        await saveAndOpenBase64(result.render_base64, `planova-render-${Date.now()}.png`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`${t('viewer.render_failed')}: ${msg}`)
    } finally {
      setRendering(false)
    }
  }, [homeScene, t])

  const handleExportGLB = useCallback(async () => {
    if (!builtGroup) return
    try {
      const blob = await exportToGLB(builtGroup)
      await saveBlob(blob, `planova-scene-${Date.now()}.glb`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`${t('viewer.export_glb')}: ${msg}`)
    }
  }, [builtGroup, t])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedObjectId || !homeScene) return
    const sceneStore = useSceneStore.getState()
    const result = deleteObject(selectedObjectId, homeScene, sceneStore.builtObjects)
    sceneStore.setHomeScene(result.homeScene)
    sceneStore.setBuiltObjects(result.builtObjects)
    useViewerStore.getState().selectObject(null)
    sceneStore.saveScene()
  }, [selectedObjectId, homeScene])

  return (
    <>
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur-sm">
      {/* Mode selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
          >
            {mode === 'walk' ? (
              <Move3D className="h-4 w-4" />
            ) : mode === 'edit' ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Orbit className="h-4 w-4" />
            )}
            <span className="text-xs">{t(`viewer.${mode}_mode`)}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          <DropdownMenuItem onClick={() => setMode('orbit')}>
            <Orbit className="mr-2 h-4 w-4" />
            {t('viewer.orbit_mode')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('walk')}>
            <Move3D className="mr-2 h-4 w-4" />
            {t('viewer.walk_mode')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('edit')}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('viewer.edit_mode')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit mode buttons */}
      {mode === 'edit' && (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button
            variant={transformMode === 'translate' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTransformMode('translate')}
            title={t('viewer.move')}
          >
            <Move className="h-4 w-4" />
          </Button>
          <Button
            variant={transformMode === 'rotate' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTransformMode('rotate')}
            title={t('viewer.rotate')}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={!selectedObjectId}
            title={t('viewer.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Ceiling toggle */}
      {homeScene && (
        <Button
          variant={showCeilings ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleCeilings}
          title={t('viewer.toggle_ceilings')}
        >
          {showCeilings ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
      )}

      {/* Open GLB */}
      <Button variant="ghost" size="sm" onClick={handleOpenFile} className="gap-1.5">
        <FolderOpen className="h-4 w-4" />
        <span className="text-xs">{t('viewer.open_glb')}</span>
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleFileChange}
      />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Export actions */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScreenshot}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        <span className="text-xs">{t('viewer.screenshot')}</span>
      </Button>

      {homeScene && (
        <Button
          variant="ghost"
          size="sm"
          onClick={openRenderDialog}
          disabled={rendering}
          className="gap-1.5"
        >
          {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          <span className="text-xs">{t('viewer.render_export')}</span>
        </Button>
      )}

      {builtGroup && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExportGLB}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          <span className="text-xs">{t('viewer.export_glb')}</span>
        </Button>
      )}

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Reset camera */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={requestResetCamera}
        title={t('viewer.reset_camera')}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>

    {/* Render prompt dialog */}
    <Dialog open={renderDialogOpen} onOpenChange={setRenderDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('viewer.render_dialog_title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <label className="text-sm font-medium">{t('viewer.render_prompt_label')}</label>
          <Textarea
            value={renderPrompt}
            onChange={(e) => setRenderPrompt(e.target.value)}
            rows={5}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRenderDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => handleRenderExport(renderPrompt)} disabled={rendering || !renderPrompt.trim()}>
            {rendering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {t('viewer.render_generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
