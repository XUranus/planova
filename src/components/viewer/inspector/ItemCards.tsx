import { useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldRow, NumberInput, Vec3Input, Vec2Input, ColorSwatch } from './FieldInputs'
import { useSceneStore } from '@/stores/sceneStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { HomeSceneJSON, SceneObject, Room, Wall, Opening, SceneMaterial, SceneLight, CameraPreset, Vec3 } from '@/types/scene'

function updateArrayById<T extends { id: string }>(arr: T[], id: string, patch: Partial<T>): T[] {
  return arr.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

function deleteArrayById<T extends { id: string }>(arr: T[], id: string): T[] {
  return arr.filter((item) => item.id !== id)
}

type SceneArrayKey = 'objects' | 'rooms' | 'walls' | 'openings' | 'materials' | 'lights' | 'cameras'

function useItemUpdater<T extends { id: string }>(arrayKey: SceneArrayKey, id: string) {
  const setHomeScene = useSceneStore((s) => s.setHomeScene)

  const update = useCallback((patch: Partial<T>) => {
    const homeScene = useSceneStore.getState().homeScene
    if (!homeScene) return
    const arr = homeScene[arrayKey] as T[]
    setHomeScene({ ...homeScene, [arrayKey]: updateArrayById(arr, id, patch) }, 'editor')
  }, [setHomeScene, arrayKey, id])

  const handleDelete = useCallback(() => {
    const homeScene = useSceneStore.getState().homeScene
    if (!homeScene) return
    const arr = homeScene[arrayKey] as T[]
    setHomeScene({ ...homeScene, [arrayKey]: deleteArrayById(arr, id) }, 'editor')
  }, [setHomeScene, arrayKey, id])

  return { update, handleDelete }
}

interface ItemCardProps {
  id: string
  children: React.ReactNode
  className?: string
  onDelete?: () => void
}

function ItemCard({ id, children, className, onDelete }: ItemCardProps) {
  const selectedObjectId = useViewerStore((s) => s.selectedObjectId)
  const selectObject = useViewerStore((s) => s.selectObject)
  const isSelected = selectedObjectId === id
  const cardRef = useRef<HTMLDivElement>(null)

  // Scroll into view when selected from 3D
  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  const handleClick = useCallback(() => {
    selectObject(isSelected ? null : id)
  }, [id, isSelected, selectObject])

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={cn(
        'rounded-md border p-2 space-y-1.5 cursor-pointer transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/30 hover:bg-accent/30',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0 space-y-1.5">{children}</div>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

// --- ObjectCard ---
interface ObjectCardProps {
  item: SceneObject
}

export function ObjectCard({ item }: ObjectCardProps) {
  const { t } = useTranslation()
  const { update, handleDelete } = useItemUpdater<SceneObject>('objects', item.id)

  return (
    <ItemCard id={item.id} onDelete={handleDelete}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-foreground truncate">{item.category}</span>
        {item.room_ref && (
          <span className="text-[10px] text-muted-foreground truncate">@ {item.room_ref}</span>
        )}
      </div>
      <FieldRow label={t('inspector.position')}>
        <Vec3Input value={item.position} onChange={(v) => update({ position: v })} />
      </FieldRow>
      <FieldRow label={t('inspector.rotation')}>
        <Vec3Input value={item.rotation} onChange={(v) => update({ rotation: v })} step={0.1} />
      </FieldRow>
      <FieldRow label={t('inspector.size')}>
        <Vec3Input value={item.size} onChange={(v) => update({ size: v })} step={0.1} />
      </FieldRow>
    </ItemCard>
  )
}

// --- RoomCard ---
interface RoomCardProps {
  item: Room
}

export function RoomCard({ item }: RoomCardProps) {
  const { t } = useTranslation()
  const { update } = useItemUpdater<Room>('rooms', item.id)

  return (
    <ItemCard id={item.id}>
      <div className="flex items-center gap-2">
        <input
          className="text-[10px] font-medium bg-transparent border-none outline-none flex-1 min-w-0 p-0 focus-visible:ring-0"
          value={item.name}
          onChange={(e) => update({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="text-[10px] text-muted-foreground shrink-0">{item.type}</span>
      </div>
      {item.area != null && (
        <FieldRow label={t('inspector.area')}>
          <span className="text-[10px]">{item.area} m²</span>
        </FieldRow>
      )}
      <FieldRow label={t('inspector.polygon')}>
        <span className="text-[10px] text-muted-foreground">{item.polygon.length} pts</span>
      </FieldRow>
    </ItemCard>
  )
}

// --- WallCard ---
interface WallCardProps {
  item: Wall
}

export function WallCard({ item }: WallCardProps) {
  return (
    <ItemCard id={item.id}>
      <span className="text-[10px] font-medium truncate">{item.id}</span>
      <FieldRow label="Start">
        <Vec2Input value={item.start} disabled />
      </FieldRow>
      <FieldRow label="End">
        <Vec2Input value={item.end} disabled />
      </FieldRow>
      <FieldRow label="H / T">
        <span className="text-[10px]">{item.height}m / {item.thickness}m</span>
      </FieldRow>
    </ItemCard>
  )
}

// --- OpeningCard ---
interface OpeningCardProps {
  item: Opening
}

export function OpeningCard({ item }: OpeningCardProps) {
  return (
    <ItemCard id={item.id}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium truncate">{item.id}</span>
        <span className="text-[10px] text-muted-foreground">{item.type}</span>
      </div>
      <FieldRow label="Wall">
        <span className="text-[10px] text-muted-foreground truncate">{item.wall_ref}</span>
      </FieldRow>
      <FieldRow label="Size">
        <span className="text-[10px]">{item.width}m × {item.height}m</span>
      </FieldRow>
    </ItemCard>
  )
}

// --- MaterialCard ---
interface MaterialCardProps {
  item: SceneMaterial
}

export function MaterialCard({ item }: MaterialCardProps) {
  const { update } = useItemUpdater<SceneMaterial>('materials', item.id)

  return (
    <ItemCard id={item.id}>
      <div className="flex items-center gap-2">
        <ColorSwatch color={item.base_color} />
        <span className="text-[10px] font-medium truncate">{item.name}</span>
      </div>
      <FieldRow label="Roughness">
        <NumberInput value={item.roughness} onChange={(v) => update({ roughness: v })} step={0.05} min={0} max={1} />
      </FieldRow>
      <FieldRow label="Metal">
        <NumberInput value={item.metalness} onChange={(v) => update({ metalness: v })} step={0.05} min={0} max={1} />
      </FieldRow>
    </ItemCard>
  )
}

// --- LightCard ---
interface LightCardProps {
  item: SceneLight
}

export function LightCard({ item }: LightCardProps) {
  const { t } = useTranslation()
  const { update } = useItemUpdater<SceneLight>('lights', item.id)

  return (
    <ItemCard id={item.id}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium truncate">{item.name}</span>
        <span className="text-[10px] text-muted-foreground">{item.type}</span>
      </div>
      <FieldRow label={t('inspector.position')}>
        <Vec3Input value={item.position} onChange={(v) => update({ position: v })} />
      </FieldRow>
      <FieldRow label={t('inspector.intensity')}>
        <NumberInput value={item.intensity} onChange={(v) => update({ intensity: v })} step={50} />
      </FieldRow>
    </ItemCard>
  )
}

// --- CameraCard ---
interface CameraCardProps {
  item: CameraPreset
}

export function CameraCard({ item }: CameraCardProps) {
  const { t } = useTranslation()
  const { update } = useItemUpdater<CameraPreset>('cameras', item.id)

  return (
    <ItemCard id={item.id}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium truncate">{item.name}</span>
        <span className="text-[10px] text-muted-foreground">{item.type}</span>
      </div>
      <FieldRow label={t('inspector.position')}>
        <Vec3Input value={item.position} onChange={(v) => update({ position: v })} />
      </FieldRow>
      <FieldRow label="Target">
        <Vec3Input value={item.target} onChange={(v) => update({ target: v })} />
      </FieldRow>
      <FieldRow label="FOV">
        <NumberInput value={item.fov} onChange={(v) => update({ fov: v })} step={5} min={10} max={120} />
      </FieldRow>
    </ItemCard>
  )
}
