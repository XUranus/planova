import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/projectStore'
import { useSceneStore } from '@/stores/sceneStore'

export function StatusBar() {
  const { t } = useTranslation()
  const files = useProjectStore((s) => s.files)
  const scenes = useSceneStore((s) => s.scenes)
  const activeSceneId = useSceneStore((s) => s.activeSceneId)
  const homeScene = useSceneStore((s) => s.homeScene)

  // Count files currently parsing across all projects
  const parsingCount = Object.values(files)
    .flat()
    .filter((f) => f.parseStatus === 'parsing' || f.parseStatus === '')
    .length

  const activeScene = scenes.find((s) => s.id === activeSceneId)

  const statusText =
    parsingCount > 0
      ? t('status_bar.parsing', { count: parsingCount })
      : activeScene && homeScene
        ? t('status_bar.room_count', { count: homeScene.rooms.length })
        : t('status_bar.ready')

  return (
    <footer className="flex h-7 items-center justify-between border-t px-5 text-[11px] text-muted-foreground">
      <span>{statusText}</span>
      <span>{t('common.version')} 0.1.0</span>
    </footer>
  )
}
