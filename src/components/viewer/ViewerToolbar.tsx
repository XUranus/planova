import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import {
  RotateCcw, Camera, FolderOpen, Move3D, Orbit, Pencil,
  Move, RotateCw, Trash2, Download, Palette,
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
import { exportToGLB, downloadBlob } from '@/engine/exportScene'

export function ViewerToolbar() {
  const { t } = useTranslation()
  const { mode, setMode, setSceneUrl, transformMode, setTransformMode, selectedObjectId, showTexturePanel, toggleTexturePanel } = useViewerStore()
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

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas')
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `planova-screenshot-${Date.now()}.png`
      link.href = dataUrl
      link.click()
    }
  }, [])

  const handleExportGLB = useCallback(async () => {
    if (!builtGroup) return
    try {
      const blob = await exportToGLB(builtGroup)
      downloadBlob(blob, `planova-scene-${Date.now()}.glb`)
    } catch {
      // Export failed silently
    }
  }, [builtGroup])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedObjectId || !homeScene) return
    const store = useViewerStore.getState()
    const sceneStore = useSceneStore.getState()

    const builtObj = sceneStore.builtObjects.find((o) => o.id === selectedObjectId)
    if (builtObj) {
      // Remove mesh from builtGroup parent (the scene)
      builtObj.mesh.parent?.remove(builtObj.mesh)
      builtObj.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      })
    }

    const updatedObjects = homeScene.objects.filter((o) => o.id !== selectedObjectId)
    sceneStore.setHomeScene({ ...homeScene, objects: updatedObjects })
    sceneStore.setBuiltObjects(sceneStore.builtObjects.filter((o) => o.id !== selectedObjectId))
    store.selectObject(null)
  }, [selectedObjectId, homeScene])

  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
      {/* Mode selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={mode === 'edit' ? 'secondary' : mode === 'walk' ? 'secondary' : 'secondary'}
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
            title="Move (M)"
          >
            <Move className="h-4 w-4" />
          </Button>
          <Button
            variant={transformMode === 'rotate' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTransformMode('rotate')}
            title="Rotate (R)"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={!selectedObjectId}
            title="Delete (Del)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}

      <div className="mx-1 h-6 w-px bg-border" />

      {/* Texture panel toggle */}
      {homeScene && (
        <Button
          variant={showTexturePanel ? 'secondary' : 'ghost'}
          size="sm"
          onClick={toggleTexturePanel}
          className="gap-1.5"
        >
          <Palette className="h-4 w-4" />
          <span className="text-xs">{t('viewer.texture_panel')}</span>
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

      {/* Reset camera - placeholder */}
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}
