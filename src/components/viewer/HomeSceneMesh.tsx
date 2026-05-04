import { useEffect, useRef, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSceneStore } from '@/stores/sceneStore'
import { buildScene, disposeScene } from '@/engine/buildScene'

/**
 * Renders a Home Scene JSON as Three.js meshes.
 * Automatically rebuilds when the scene data changes.
 */
export function HomeSceneMesh() {
  const homeScene = useSceneStore((s) => s.homeScene)
  const { scene } = useThree()
  const groupRef = useRef<THREE.Group | null>(null)

  const builtScene = useMemo(() => {
    if (!homeScene) return null
    return buildScene(homeScene)
  }, [homeScene])

  useEffect(() => {
    if (builtScene) {
      groupRef.current = builtScene.group
      scene.add(builtScene.group)
    }

    return () => {
      if (builtScene) {
        scene.remove(builtScene.group)
        disposeScene(builtScene)
        groupRef.current = null
      }
    }
  }, [builtScene, scene])

  // Visibility toggle based on homeScene state
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.visible = !!homeScene
    }
  }, [homeScene])

  return null // Meshes are added directly to the scene
}
