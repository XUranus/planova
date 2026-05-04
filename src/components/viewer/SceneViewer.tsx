import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Grid, useGLTF, Center } from '@react-three/drei'
import { useTranslation } from 'react-i18next'
import { useViewerStore } from '@/stores/viewerStore'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene} />
    </Center>
  )
}

function SceneContent() {
  const sceneUrl = useViewerStore((s) => s.sceneUrl)

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, 10, -5]} intensity={0.3} />

      {sceneUrl && <Model url={sceneUrl} />}

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

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />

      <Environment preset="apartment" />
    </>
  )
}

export function SceneViewer() {
  const { t } = useTranslation()
  const sceneUrl = useViewerStore((s) => s.sceneUrl)

  return (
    <div className="h-full w-full bg-muted/30">
      <Canvas
        camera={{ position: [8, 6, 8], fov: 50 }}
        shadows
        gl={{ preserveDrawingBuffer: true }}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>

      {!sceneUrl && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-medium text-muted-foreground">{t('viewer.no_model')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('viewer.open_model_hint')}</p>
        </div>
      )}
    </div>
  )
}
