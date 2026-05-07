import { useRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Vec2, Vec3 } from '@/types/scene'

// --- FieldRow: label + value in a compact horizontal layout ---
interface FieldRowProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function FieldRow({ label, children, className }: FieldRowProps) {
  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className="w-16 shrink-0 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// --- NumberInput: debounced numeric input ---
interface NumberInputProps {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  disabled?: boolean
  className?: string
}

export function NumberInput({ value, onChange, step = 0.1, min, max, disabled, className }: NumberInputProps) {
  const [local, setLocal] = useState(String(value))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastValueRef = useRef(value)

  // Sync from parent when value changes externally
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value
      setLocal(String(value))
    }
  }, [value])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setLocal(raw)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const num = parseFloat(raw)
      if (!isNaN(num)) {
        lastValueRef.current = num
        onChange(num)
      }
    }, 300)
  }, [onChange])

  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const num = parseFloat(local)
    if (!isNaN(num) && num !== value) {
      lastValueRef.current = num
      onChange(num)
    } else {
      setLocal(String(value))
    }
  }, [local, value, onChange])

  return (
    <input
      type="number"
      value={local}
      onChange={handleChange}
      onBlur={handleBlur}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      className={cn(
        'h-6 w-full rounded border border-input bg-transparent px-1.5 text-xs',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
    />
  )
}

// --- Vec3Input: three NumberInputs for X/Y/Z ---
interface Vec3InputProps {
  value: Vec3
  onChange: (v: Vec3) => void
  step?: number
  disabled?: boolean
  labels?: [string, string, string]
}

export function Vec3Input({ value, onChange, step = 0.1, disabled, labels = ['X', 'Y', 'Z'] }: Vec3InputProps) {
  const handleChange = useCallback((index: number, num: number) => {
    const next: Vec3 = [...value]
    next[index] = num
    onChange(next)
  }, [value, onChange])

  return (
    <div className="flex gap-1">
      {labels.map((label, i) => (
        <div key={label} className="flex-1 flex items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground w-3">{label}</span>
          <NumberInput
            value={value[i]}
            onChange={(n) => handleChange(i, n)}
            step={step}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  )
}

// --- Vec2Input: two NumberInputs for X/Y ---
interface Vec2InputProps {
  value: Vec2
  onChange: (v: Vec2) => void
  step?: number
  disabled?: boolean
  labels?: [string, string]
}

export function Vec2Input({ value, onChange, step = 0.1, disabled, labels = ['X', 'Y'] }: Vec2InputProps) {
  const handleChange = useCallback((index: number, num: number) => {
    const next: Vec2 = [...value]
    next[index] = num
    onChange(next)
  }, [value, onChange])

  return (
    <div className="flex gap-1">
      {labels.map((label, i) => (
        <div key={label} className="flex-1 flex items-center gap-0.5">
          <span className="text-[10px] text-muted-foreground w-3">{label}</span>
          <NumberInput
            value={value[i]}
            onChange={(n) => handleChange(i, n)}
            step={step}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  )
}

// --- ColorSwatch: small colored circle ---
interface ColorSwatchProps {
  color: string
  size?: number
}

export function ColorSwatch({ color, size = 14 }: ColorSwatchProps) {
  return (
    <span
      className="inline-block rounded-full border border-border shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  )
}

// --- JsonToggle: "View JSON" / "Hide JSON" button ---
interface JsonToggleProps {
  show: boolean
  onToggle: () => void
}

export function JsonToggle({ show, onToggle }: JsonToggleProps) {
  const { t } = useTranslation()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground"
      onClick={(e) => { e.preventDefault(); onToggle() }}
    >
      <Code className="h-3 w-3" />
      {show ? t('inspector.hide_json') : t('inspector.view_json')}
    </Button>
  )
}

// --- highlightJson: lightweight regex-based JSON syntax coloring ---
function highlightJson(json: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let i = 0
  // Match: strings, numbers, booleans/null, keys (property names before colon)
  const regex = /("(?:[^"\\]|\\.)*")\s*(:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|(true|false|null)\b/g
  let match: RegExpExecArray | null
  let last = 0

  while ((match = regex.exec(json)) !== null) {
    // Push plain text before this match
    if (match.index > last) {
      parts.push(<span key={i++} className="text-muted-foreground">{json.slice(last, match.index)}</span>)
    }

    if (match[1] !== undefined) {
      // It's a quoted string
      if (match[2] !== undefined) {
        // key (followed by colon)
        parts.push(<span key={i++} className="text-[hsl(210,70%,60%)]">{match[1]}</span>)
        parts.push(<span key={i++} className="text-muted-foreground">:</span>)
      } else {
        // string value
        parts.push(<span key={i++} className="text-[hsl(130,55%,50%)]">{match[1]}</span>)
      }
    } else if (match[3] !== undefined) {
      // number
      parts.push(<span key={i++} className="text-[hsl(25,80%,55%)]">{match[3]}</span>)
    } else if (match[4] !== undefined) {
      // boolean/null
      parts.push(<span key={i++} className="text-[hsl(280,60%,60%)]">{match[4]}</span>)
    }

    last = match.index + match[0].length
  }

  // Trailing text
  if (last < json.length) {
    parts.push(<span key={i++} className="text-muted-foreground">{json.slice(last)}</span>)
  }

  return parts
}

// --- InlineJson: syntax-highlighted, optionally editable JSON for a section ---
interface InlineJsonProps {
  data: unknown
  onChange?: (newData: unknown) => void
  readOnly?: boolean
}

export function InlineJson({ data, onChange, readOnly }: InlineJsonProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startEdit = useCallback(() => {
    setDraft(JSON.stringify(data, null, 2))
    setError(null)
    setEditing(true)
  }, [data])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setError(null)
  }, [])

  const saveEdit = useCallback(() => {
    try {
      const parsed = JSON.parse(draft)
      setEditing(false)
      setError(null)
      onChange?.(parsed)
    } catch (e) {
      setError((e as SyntaxError).message)
    }
  }, [draft, onChange])

  const fontFamily = "'Monaco', 'Menlo', 'Cascadia Code', 'Consolas', monospace"

  if (editing) {
    return (
      <div className="mt-1 rounded border border-border overflow-hidden">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="w-full max-h-60 min-h-[120px] resize-y bg-muted/30 p-2 text-[11px] leading-tight whitespace-pre outline-none"
          style={{ fontFamily }}
        />
        {error && <div className="px-2 py-0.5 text-[10px] text-destructive bg-destructive/10">{error}</div>}
        <div className="flex gap-1 px-2 py-1 border-t border-border bg-muted/30">
          <Button size="sm" className="h-5 px-2 text-[10px]" onClick={saveEdit}>{t('common.save')}</Button>
          <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px]" onClick={cancelEdit}>{t('common.cancel')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 group/json relative rounded bg-muted/50 overflow-hidden">
      <pre
        className="max-h-60 overflow-auto p-2 text-[11px] leading-tight whitespace-pre-wrap break-all"
        style={{ fontFamily }}
      >
        {highlightJson(JSON.stringify(data, null, 2))}
      </pre>
      {!readOnly && onChange && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-1 right-1 h-5 px-1.5 text-[10px] opacity-0 group-hover/json:opacity-100 transition-opacity"
          onClick={startEdit}
        >
          {t('inspector.edit_json')}
        </Button>
      )}
    </div>
  )
}

// --- SectionWrapper: details/summary with count badge ---
interface SectionWrapperProps {
  title: string
  count: number
  defaultOpen?: boolean
  showJson: boolean
  onToggleJson: () => void
  jsonData: unknown
  onJsonChange?: (newData: unknown) => void
  readOnly?: boolean
  children: React.ReactNode
}

export function SectionWrapper({ title, count, defaultOpen = false, showJson, onToggleJson, jsonData, onJsonChange, readOnly, children }: SectionWrapperProps) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none rounded px-1 py-1.5 hover:bg-accent/50 list-none [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-0 -rotate-90" />
        <span className="text-xs font-medium flex-1">{title}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{count}</span>
        <JsonToggle show={showJson} onToggle={onToggleJson} />
      </summary>
      <div className="pl-4 pb-2 space-y-1">
        {showJson ? <InlineJson data={jsonData} onChange={onJsonChange} readOnly={readOnly} /> : children}
      </div>
    </details>
  )
}
