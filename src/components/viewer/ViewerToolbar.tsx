import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Camera, FolderOpen, Move3D, Orbit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useViewerStore } from '@/stores/viewerStore'

export function ViewerToolbar() {
  const { t } = useTranslation()
  const { mode, setMode, setSceneUrl } = useViewerStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setSceneUrl(url)
    }
  }, [setSceneUrl])

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

  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-lg backdrop-blur">
      {/* Mode selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={mode === 'orbit' ? 'secondary' : 'ghost'} size="sm" className="gap-1.5">
            <Orbit className="h-4 w-4" />
            <span className="text-xs">{t(`viewer.${mode}_mode`)}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          <DropdownMenuItem onClick={() => setMode('orbit')}>
            <Orbit className="mr-2 h-4 w-4" />
            {t('viewer.orbit_mode')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('walk')} disabled>
            <Move3D className="mr-2 h-4 w-4" />
            {t('viewer.walk_mode')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-1 h-6 w-px bg-border" />

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
      <Button variant="ghost" size="sm" onClick={handleScreenshot} className="gap-1.5">
        <Camera className="h-4 w-4" />
        <span className="text-xs">{t('viewer.screenshot')}</span>
      </Button>

      {/* Reset camera - placeholder for now */}
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  )
}
