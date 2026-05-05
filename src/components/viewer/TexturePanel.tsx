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
 * Inline texture selector for the right sidebar.
 * Shows texture presets grouped by surface category with preview thumbnails.
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
      // Persist to backend (debounced by the store)
      saveScene()
    },
    [homeScene, currentOverrides, setHomeScene, saveScene],
  )

  if (!homeScene) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('viewer.texture_panel')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {CATEGORIES.map(({ key, i18nKey }) => {
          const categoryPresets = PRESETS.filter((p) => p.category === key)
          const selected = currentOverrides[key]
          return (
            <div key={key} className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">{t(i18nKey)}</p>
              <div className="grid grid-cols-5 gap-1">
                {/* None option */}
                <button
                  onClick={() => handleSelect(key, null)}
                  className={`flex h-10 w-full items-center justify-center rounded border text-[9px] transition-colors ${
                    !selected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input hover:bg-accent'
                  }`}
                >
                  {t('viewer.texture_none')}
                </button>
                {/* Presets */}
                {categoryPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelect(key, preset.id)}
                    className={`h-10 w-full overflow-hidden rounded border transition-colors ${
                      selected === preset.id
                        ? 'border-primary ring-1 ring-primary'
                        : 'border-input hover:border-muted-foreground/50'
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
