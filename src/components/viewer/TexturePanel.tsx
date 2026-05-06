import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSceneStore } from '@/stores/sceneStore'
import { PRESETS, generatePreviewDataURL } from '@/engine/proceduralTextures'
import type { HomeSceneJSON } from '@/types/scene'

type Category = 'floor' | 'wall' | 'ceiling'

const CATEGORIES: { key: Category; i18nKey: string }[] = [
  { key: 'floor', i18nKey: 'viewer.texture_floor' },
  { key: 'wall', i18nKey: 'viewer.texture_wall' },
  { key: 'ceiling', i18nKey: 'viewer.texture_ceiling' },
]

/**
 * Compact inline texture selector with horizontal scrolling per category.
 */
export function TexturePanel() {
  const { t } = useTranslation()
  const homeScene = useSceneStore((s) => s.homeScene)
  const setHomeScene = useSceneStore((s) => s.setHomeScene)
  const saveScene = useSceneStore((s) => s.saveScene)

  const previews = useMemo(() => {
    const map: Record<string, string> = {}
    for (const preset of PRESETS) {
      map[preset.id] = generatePreviewDataURL(preset.id, 64)
    }
    return map
  }, [])

  const currentOverrides = homeScene?.global.texture_overrides || {}

  const handleSelect = useCallback(
    (category: Category, presetId: string | null) => {
      if (!homeScene) return
      const updated: HomeSceneJSON = {
        ...homeScene,
        global: {
          ...homeScene.global,
          texture_overrides: {
            ...currentOverrides,
            [category]: presetId || undefined,
          },
        },
      }
      setHomeScene(updated)
      saveScene()
    },
    [homeScene, currentOverrides, setHomeScene, saveScene],
  )

  if (!homeScene) return null

  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="text-xs font-medium">{t('viewer.texture_panel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 px-3 pb-3">
        {CATEGORIES.map(({ key, i18nKey }) => {
          const categoryPresets = PRESETS.filter((p) => p.category === key)
          const selected = currentOverrides[key]
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground">
                {t(i18nKey)}
              </span>
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {/* None option */}
                <button
                  onClick={() => handleSelect(key, null)}
                  className={`flex h-7 shrink-0 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-colors ${
                    !selected
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {t('viewer.texture_none')}
                </button>
                {/* Presets */}
                {categoryPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelect(key, preset.id)}
                    className={`h-7 w-7 shrink-0 overflow-hidden rounded-md border transition-all ${
                      selected === preset.id
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-input hover:border-muted-foreground/50 hover:ring-1 hover:ring-muted-foreground/20'
                    }`}
                    title={preset.name}
                  >
                    <img
                      src={previews[preset.id]}
                      alt={preset.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
