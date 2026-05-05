import { useEffect, useRef, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSceneStore } from '@/stores/sceneStore'
import { useViewerStore } from '@/stores/viewerStore'
import { buildScene, disposeScene } from '@/engine/buildScene'

/**
 * Renders a Home Scene JSON as Three.js meshes.
 * Automatically rebuilds when the scene data changes.
 */
export function HomeSceneMesh() {
  const homeScene = useSceneStore((s) => s.homeScene)
  const showCeilings = useViewerStore((s) => s.showCeilings)
  const setBuiltObjects = useSceneStore((s) => s.setBuiltObjects)
  const setBuiltGroup = useSceneStore((s) => s.setBuiltGroup)
  const { scene } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)
  const ceilingsRef = useRef<{ mesh: THREE.Mesh }[]>([])

  const builtScene = useMemo(() => {
    if (!homeScene) return null
    return buildScene(homeScene)
  }, [homeScene])

  useEffect(() => {
    if (builtScene) {
      groupRef.current = builtScene.group
      ceilingsRef.current = builtScene.ceilings
      scene.add(builtScene.group)
      setBuiltObjects(builtScene.objects)
      setBuiltGroup(builtScene.group)

      // Apply current ceiling visibility on build
      for (const ceiling of builtScene.ceilings) {
        ceiling.mesh.visible = showCeilings
      }
    }

    return () => {
      if (builtScene) {
        scene.remove(builtScene.group)
        disposeScene(builtScene)
        groupRef.current = null
        ceilingsRef.current = []
        setBuiltObjects([])
        setBuiltGroup(null)
      }
    }
  }, [builtScene, scene, setBuiltObjects, setBuiltGroup])

  // Visibility toggle based on homeScene state
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.visible = !!homeScene
    }
  }, [homeScene])

  // Ceiling visibility toggle — lightweight, no rebuild
  useEffect(() => {
    for (const ceiling of ceilingsRef.current) {
      ceiling.mesh.visible = showCeilings
    }
  }, [showCeilings])

  return null // Meshes are added directly to the scene
}
