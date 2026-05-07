import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useSceneStore } from '@/stores/sceneStore'
import type { HomeSceneJSON, ParseQuality } from '@/types/scene'
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

function ParseQualityBadge({ quality }: { quality: ParseQuality }) {
  const { t } = useTranslation()
  const scorePercent = Math.round(quality.overall_score * 100)
  const isGood = scorePercent >= 80
  const isWarning = quality.needs_user_review

  return (
    <div className="px-2 py-1.5 rounded-md border border-border bg-muted/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted-foreground">{t('inspector.parse_quality')}</span>
        {isWarning ? (
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
        ) : (
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${scorePercent}%`,
              backgroundColor: isGood ? 'hsl(142, 71%, 45%)' : isWarning ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)',
            }}
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums">{scorePercent}%</span>
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
        <span>{t('inspector.geometry')}: {Math.round(quality.geometry_score * 100)}%</span>
        <span>{t('inspector.semantic')}: {Math.round(quality.semantic_score * 100)}%</span>
        <span>{t('inspector.scale')}: {Math.round(quality.scale_score * 100)}%</span>
      </div>
    </div>
  )
}

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
      {homeScene.parse_quality && (
        <ParseQualityBadge quality={homeScene.parse_quality} />
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
