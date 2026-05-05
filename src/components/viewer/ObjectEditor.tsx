import { useRef, useCallback, useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import { useViewerStore } from '@/stores/viewerStore'
import { useSceneStore } from '@/stores/sceneStore'
import { deleteObject } from '@/engine/deleteObject'
import type { BuiltObject } from '@/engine/buildObjects'

const HIGHLIGHT_COLOR = new THREE.Color('#3b82f6')
const HIGHLIGHT_INTENSITY = 0.15

/**
 * Finds the BuiltObject whose mesh contains the given THREE.Object3D.
 */
function findBuiltObject(
  objects: BuiltObject[],
  hit: THREE.Object3D,
): BuiltObject | null {
  let current: THREE.Object3D | null = hit
  while (current) {
    const found = objects.find((o) => o.mesh === current)
    if (found) return found
    current = current.parent
  }
  return null
}

/**
 * Applies or removes selection highlight (emissive glow) on a mesh group.
 */
function setHighlight(group: THREE.Group, on: boolean): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshStandardMaterial
      if (on) {
        mat.emissive = HIGHLIGHT_COLOR
        mat.emissiveIntensity = HIGHLIGHT_INTENSITY
      } else {
        mat.emissive = new THREE.Color(0, 0, 0)
        mat.emissiveIntensity = 0
      }
    }
  })
}

/**
 * Editor overlay: click-to-select, TransformControls, delete, highlighting.
 * Only active when viewer mode is 'edit'.
 */
export function ObjectEditor() {
  const { camera, gl } = useThree()
  const mode = useViewerStore((s) => s.mode)
  const selectedObjectId = useViewerStore((s) => s.selectedObjectId)
  const selectObject = useViewerStore((s) => s.selectObject)
  const transformMode = useViewerStore((s) => s.transformMode)
  const builtObjects = useSceneStore((s) => s.builtObjects)
  const homeScene = useSceneStore((s) => s.homeScene)
  const setHomeScene = useSceneStore((s) => s.setHomeScene)
  const setBuiltObjects = useSceneStore((s) => s.setBuiltObjects)
  const saveScene = useSceneStore((s) => s.saveScene)

  const [selectedMesh, setSelectedMesh] = useState<THREE.Group | null>(null)
  const setHoveredObject = useViewerStore((s) => s.setHoveredObject)
  const prevSelectedIdRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced save — waits 300ms after last change before persisting
  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveScene()
    }, 300)
  }, [saveScene])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  // Update selectedMesh when selection changes
  useEffect(() => {
    if (prevSelectedIdRef.current) {
      const prev = builtObjects.find((o) => o.id === prevSelectedIdRef.current)
      if (prev) setHighlight(prev.mesh, false)
    }

    if (selectedObjectId) {
      const obj = builtObjects.find((o) => o.id === selectedObjectId)
      if (obj) {
        setSelectedMesh(obj.mesh)
        setHighlight(obj.mesh, true)
      } else {
        setSelectedMesh(null)
      }
    } else {
      setSelectedMesh(null)
    }

    prevSelectedIdRef.current = selectedObjectId
  }, [selectedObjectId, builtObjects])

  // Sync transform changes back to scene data
  const handleObjectChange = useCallback(() => {
    if (!selectedMesh || !homeScene || !selectedObjectId) return

    const updatedObjects = homeScene.objects.map((obj) => {
      if (obj.id !== selectedObjectId) return obj
      return {
        ...obj,
        position: [selectedMesh.position.x, selectedMesh.position.y, selectedMesh.position.z] as [number, number, number],
        rotation: [selectedMesh.rotation.x, selectedMesh.rotation.y, selectedMesh.rotation.z] as [number, number, number],
      }
    })

    setHomeScene({ ...homeScene, objects: updatedObjects })

    // Update builtObjects in-place for raycasting accuracy
    const builtObj = builtObjects.find((o) => o.id === selectedObjectId)
    if (builtObj) {
      builtObj.sceneObject.position = [selectedMesh.position.x, selectedMesh.position.y, selectedMesh.position.z]
      builtObj.sceneObject.rotation = [selectedMesh.rotation.x, selectedMesh.rotation.y, selectedMesh.rotation.z]
    }

    debouncedSave()
  }, [selectedMesh, homeScene, selectedObjectId, setHomeScene, builtObjects, debouncedSave])

  // Keyboard shortcuts: Delete, R for rotate toggle
  useEffect(() => {
    if (mode !== 'edit') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObjectId && homeScene) {
        const result = deleteObject(selectedObjectId, homeScene, builtObjects)
        setHomeScene(result.homeScene)
        setBuiltObjects(result.builtObjects)
        selectObject(null)
        // Flush any pending debounced save, then save immediately
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveScene()
      }

      if (e.key === 'r' || e.key === 'R') {
        const store = useViewerStore.getState()
        store.setTransformMode(store.transformMode === 'translate' ? 'rotate' : 'translate')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, selectedObjectId, homeScene, builtObjects, selectObject, setHomeScene, setBuiltObjects, saveScene])

  // Raycasting for click-to-select
  useEffect(() => {
    if (mode !== 'edit') return

    const domElement = gl.domElement
    const handler = (e: MouseEvent) => {
      const rect = domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)

      const allMeshes: THREE.Object3D[] = []
      for (const obj of builtObjects) {
        obj.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            allMeshes.push(child)
          }
        })
      }

      const intersects = raycaster.intersectObjects(allMeshes, false)

      if (intersects.length > 0) {
        const hit = intersects[0].object
        const builtObj = findBuiltObject(builtObjects, hit)
        if (builtObj) {
          selectObject(builtObj.id)
          return
        }
      }

      selectObject(null)
    }

    domElement.addEventListener('pointerdown', handler)
    return () => domElement.removeEventListener('pointerdown', handler)
  }, [mode, camera, gl, builtObjects, selectObject])

  // Hover raycasting for furniture category tooltip
  useEffect(() => {
    if (mode !== 'edit') return

    const domElement = gl.domElement
    const handler = (e: MouseEvent) => {
      const rect = domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)

      const allMeshes: THREE.Object3D[] = []
      for (const obj of builtObjects) {
        obj.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            allMeshes.push(child)
          }
        })
      }

      const intersects = raycaster.intersectObjects(allMeshes, false)

      if (intersects.length > 0) {
        const hit = intersects[0].object
        const builtObj = findBuiltObject(builtObjects, hit)
        if (builtObj) {
          setHoveredObject(builtObj.sceneObject.category, { x: e.clientX, y: e.clientY })
          return
        }
      }
      setHoveredObject(null, null)
    }

    domElement.addEventListener('pointermove', handler)
    return () => domElement.removeEventListener('pointermove', handler)
  }, [mode, camera, gl, builtObjects, setHoveredObject])

  if (mode !== 'edit') return null

  return (
    <>
      {selectedMesh && (
        <TransformControls
          object={selectedMesh}
          mode={transformMode}
          onObjectChange={handleObjectChange}
          size={0.6}
        />
      )}
    </>
  )
}
