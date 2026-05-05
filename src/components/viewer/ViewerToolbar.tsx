import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RotateCcw, Camera, FolderOpen, Move3D, Orbit, Pencil,
  Move, RotateCw, Trash2, Download, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useViewerStore } from '@/stores/viewerStore'
import { useSceneStore } from '@/stores/sceneStore'
import { deleteObject } from '@/engine/deleteObject'
import { exportToGLB } from '@/engine/exportScene'
import { toast } from '@/stores/toastStore'

/**
 * Save a Blob to disk. Uses Tauri native save dialog if available,
 * otherwise falls back to browser <a> download.
 */
async function saveBlob(blob: Blob, defaultName: string) {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const filePath = await save({
      defaultPath: defaultName,
      filters: [{ name: defaultName.split('.').pop()?.toUpperCase() || 'File', extensions: [defaultName.split('.').pop() || ''] }],
    })
    if (!filePath) return // user cancelled
    const data = new Uint8Array(await blob.arrayBuffer())
    await writeFile(filePath, data)
    toast.success(defaultName)
  } catch {
    // Not in Tauri — fallback to browser download
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = defaultName
    link.click()
    URL.revokeObjectURL(url)
    toast.success(defaultName)
  }
}

export function ViewerToolbar() {
  const { t } = useTranslation()
  const { mode, setMode, setSceneUrl, transformMode, setTransformMode, selectedObjectId, showCeilings, toggleCeilings, requestResetCamera } = useViewerStore()
  const builtGroup = useSceneStore((s) => s.builtGroup)
  const homeScene = useSceneStore((s) => s.homeScene)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
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
          <div className="mx-1 h-6 w-px bg-border" />
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

      <div className="mx-1 h-6 w-px bg-border" />

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

      {/* Screenshot */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScreenshot}
        className="gap-1.5"
      >
        <Camera className="h-4 w-4" />
        <span className="text-xs">{t('viewer.screenshot')}</span>
      </Button>

      {/* Export GLB */}
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
  )
}
