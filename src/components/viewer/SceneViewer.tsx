import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, useGLTF, Center } from '@react-three/drei'
import { useTranslation } from 'react-i18next'
import { useViewerStore } from '@/stores/viewerStore'
import { useSceneStore } from '@/stores/sceneStore'
import { HomeSceneMesh } from './HomeSceneMesh'
import { WalkControls } from './WalkControls'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  )
}

/**
 * Camera controller that syncs with viewerStore mode.
 * Renders OrbitControls in orbit mode, WalkControls in walk mode.
 */
function CameraController() {
  const mode = useViewerStore((s) => s.mode)
  const homeScene = useSceneStore((s) => s.homeScene)
  const { camera } = useThree()

  // When a home scene loads, position camera at the first camera preset
  useEffect(() => {
    if (homeScene?.cameras?.[0]) {
      const preset = homeScene.cameras[0]
      camera.position.set(preset.position[0], preset.position[1], preset.position[2])
      camera.lookAt(preset.target[0], preset.target[1], preset.target[2])
    }
  }, [homeScene, camera])

  if (mode === 'walk') {
    return <WalkControls />
  }

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={1}
      maxDistance={50}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  )
}

function SceneContent() {
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const homeScene = useSceneStore((s) => s.homeScene)
  const mode = useViewerStore((s) => s.mode)

  // Hide grid when home scene is active (it has its own floors)
  const showGrid = !homeScene

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.25} />

      {/* GLB model (Phase 1) */}
      {sceneUrl && !homeScene && <Model url={sceneUrl} />}

      {/* Home Scene geometry (Phase 2) */}
      {homeScene && <HomeSceneMesh />}

      {/* Ground grid */}
      {showGrid && (
        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#9ca3af"
          fadeDistance={30}
          fadeStrength={1}
          infiniteGrid
          position={[0, -0.01, 0]}
        />
      )}

      {/* Camera controls */}
      <CameraController />

      {/* Walk mode hint */}
      {mode === 'walk' && (
        <mesh position={[0, -10, 0]}>
          {/* Invisible mesh — just a placeholder to keep R3F happy for the hint text below */}
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </>
  )
}

export function SceneViewer() {
  const { t } = useTranslation()
  const sceneUrl = useViewerStore((s) => s.sceneUrl)
  const homeScene = useSceneStore((s) => s.homeScene)
  const mode = useViewerStore((s) => s.mode)
  const showEmpty = !sceneUrl && !homeScene

  return (
    <div className="relative h-full w-full bg-muted/30">
      <Canvas
        camera={{ position: [8, 6, 8], fov: 50 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>

      {/* Walk mode overlay hint */}
      {mode === 'walk' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-lg bg-background/80 px-4 py-2 text-sm text-muted-foreground backdrop-blur">
          WASD {t('viewer.walk_hint')} · Space {t('viewer.exit_walk')}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-medium text-muted-foreground">{t('viewer.no_model')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('viewer.open_model_hint')}</p>
        </div>
      )}
    </div>
  )
}
