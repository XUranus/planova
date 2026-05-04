import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useViewerStore } from '@/stores/viewerStore'
import { useSceneStore } from '@/stores/sceneStore'
import { getMaterial } from '@/engine/materials'
import type { SceneMaterial } from '@/types/scene'

/**
 * Floating material panel: shows available materials when an object is selected in edit mode.
 * Click a material to apply it to the selected object's mesh.
 */
export function MaterialPanel() {
  const { t } = useTranslation()
  const mode = useViewerStore((s) => s.mode)
  const selectedObjectId = useViewerStore((s) => s.selectedObjectId)
  const homeScene = useSceneStore((s) => s.homeScene)
  const builtObjects = useSceneStore((s) => s.builtObjects)

  const handleApplyMaterial = useCallback(
    (mat: SceneMaterial) => {
      if (!selectedObjectId || !homeScene) return

      const builtObj = builtObjects.find((o) => o.id === selectedObjectId)
      if (!builtObj) return

      // Apply material to the Three.js mesh
      const threeMat = getMaterial(mat)
      builtObj.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = threeMat
        }
      })

      // Update scene data
      const updatedObjects = homeScene.objects.map((obj) => {
        if (obj.id !== selectedObjectId) return obj
        return {
          ...obj,
          material_overrides: { ...obj.material_overrides, default: mat.id },
        }
      })
      useSceneStore.getState().setHomeScene({ ...homeScene, objects: updatedObjects })
    },
    [selectedObjectId, homeScene, builtObjects],
  )

  if (mode !== 'edit' || !selectedObjectId || !homeScene) return null

  const materials = homeScene.materials
  if (!materials || materials.length === 0) return null

  return (
    <Card className="absolute right-4 top-4 w-56 shadow-lg backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">{t('viewer.material_panel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {materials.map((mat) => (
          <button
            key={mat.id}
            onClick={() => handleApplyMaterial(mat)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
          >
            <span
              className="inline-block h-4 w-4 shrink-0 rounded border"
              style={{ backgroundColor: mat.base_color }}
            />
            <span className="truncate">{mat.name}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
