import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '@/stores/sceneStore'
import type { HomeSceneJSON } from '@/types/scene'
import { SectionWrapper } from './inspector/FieldInputs'
import {
  ObjectCard,
  RoomCard,
  WallCard,
  OpeningCard,
  MaterialCard,
  LightCard,
  CameraCard,
} from './inspector/ItemCards'

export function SceneInspector() {
  const { t } = useTranslation()
  const homeScene = useSceneStore((s) => s.homeScene)
  const projectId = useSceneStore((s) => s.projectId)
  const setHomeScene = useSceneStore((s) => s.setHomeScene)
  const isReadOnly = projectId === null

  const [showJson, setShowJson] = useState<Record<string, boolean>>({})

  const toggleJson = useCallback((key: string) => {
    setShowJson((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleSectionChange = useCallback((key: string, newData: unknown) => {
    const current = useSceneStore.getState().homeScene
    if (!current) return
    const updated = { ...current, [key]: newData } as HomeSceneJSON
    setHomeScene(updated, 'editor')
  }, [setHomeScene])

  if (!homeScene) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t('inspector.no_scene')}
      </div>
    )
  }

  const sections = [
    { key: 'objects', title: t('inspector.objects'), count: homeScene.objects.length, data: homeScene.objects, defaultOpen: true },
    { key: 'rooms', title: t('inspector.rooms'), count: homeScene.rooms.length, data: homeScene.rooms, defaultOpen: true },
    { key: 'walls', title: t('inspector.walls'), count: homeScene.walls.length, data: homeScene.walls, defaultOpen: false },
    { key: 'openings', title: t('inspector.openings'), count: homeScene.openings.length, data: homeScene.openings, defaultOpen: false },
    { key: 'materials', title: t('inspector.materials'), count: homeScene.materials.length, data: homeScene.materials, defaultOpen: false },
    { key: 'lights', title: t('inspector.lights'), count: homeScene.lights.length, data: homeScene.lights, defaultOpen: false },
    { key: 'cameras', title: t('inspector.cameras'), count: homeScene.cameras.length, data: homeScene.cameras, defaultOpen: false },
  ]

  return (
    <div className="h-full overflow-auto px-1 py-1 space-y-0.5 scrollbar-thin">
      {isReadOnly && (
        <div className="px-1 py-0.5 text-[10px] text-muted-foreground mb-1">{t('inspector.readonly')}</div>
      )}
      {sections.map((section) => (
        <SectionWrapper
          key={section.key}
          title={section.title}
          count={section.count}
          defaultOpen={section.defaultOpen}
          showJson={showJson[section.key] ?? false}
          onToggleJson={() => toggleJson(section.key)}
          jsonData={section.data}
          onJsonChange={isReadOnly ? undefined : (data) => handleSectionChange(section.key, data)}
          readOnly={isReadOnly}
        >
          {section.key === 'objects' && homeScene.objects.map((item) => (
            <ObjectCard key={item.id} item={item} />
          ))}
          {section.key === 'rooms' && homeScene.rooms.map((item) => (
            <RoomCard key={item.id} item={item} />
          ))}
          {section.key === 'walls' && homeScene.walls.map((item) => (
            <WallCard key={item.id} item={item} />
          ))}
          {section.key === 'openings' && homeScene.openings.map((item) => (
            <OpeningCard key={item.id} item={item} />
          ))}
          {section.key === 'materials' && homeScene.materials.map((item) => (
            <MaterialCard key={item.id} item={item} />
          ))}
          {section.key === 'lights' && homeScene.lights.map((item) => (
            <LightCard key={item.id} item={item} />
          ))}
          {section.key === 'cameras' && homeScene.cameras.map((item) => (
            <CameraCard key={item.id} item={item} />
          ))}
        </SectionWrapper>
      ))}
    </div>
  )
}
