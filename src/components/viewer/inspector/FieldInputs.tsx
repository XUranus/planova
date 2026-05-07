import { useRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code, ChevronDown } from 'lucide-react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language'
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

// --- CodeMirror JSON editor (reusable, lightweight) ---
function jsonLint(view: EditorView) {
  const doc = view.state.doc.toString()
  if (!doc.trim()) return []
  try {
    JSON.parse(doc)
    return []
  } catch (e) {
    const msg = (e as SyntaxError).message
    const match = msg.match(/position (\d+)/)
    const pos = match ? parseInt(match[1]) : 0
    const line = view.state.doc.lineAt(pos)
    return [{ from: line.from, to: line.to, severity: 'error' as const, message: msg }]
  }
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12px', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', monospace",
    overflow: 'auto',
  },
  '.cm-content': { padding: '4px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid var(--border)', color: 'var(--muted-foreground)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 50%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--primary) 25%, transparent) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--primary) 25%, transparent) !important' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent)', outline: 'none' },
  '.cm-lintPoint-error::after': { borderBottomColor: 'var(--destructive)' },
})

interface CodeMirrorJsonEditorProps {
  doc: string
  onSave: (content: string) => void
  onCancel: () => void
}

function CodeMirrorJsonEditor({ doc, onSave, onCancel }: CodeMirrorJsonEditorProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const contentRef = useRef(doc)

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        contentRef.current = update.state.doc.toString()
      }
    })

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          foldGutter(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          json(),
          linter(jsonLint, { delay: 300 }),
          lintGutter(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          editorTheme,
          updateListener,
        ],
      }),
    })

    viewRef.current = view
    // Focus and place cursor at end
    view.focus()
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    return () => { view.destroy(); viewRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    onSave(contentRef.current)
  }, [onSave])

  return (
    <div className="mt-1 rounded border border-border overflow-hidden">
      <div ref={containerRef} className="h-[400px] overflow-hidden" />
      <div className="flex gap-1 px-2 py-1.5 border-t border-border bg-muted/30">
        <Button size="sm" className="h-6 px-3 text-xs" onClick={handleSave}>{t('common.save')}</Button>
        <Button size="sm" variant="ghost" className="h-6 px-3 text-xs" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
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
  const [error, setError] = useState<string | null>(null)

  const startEdit = useCallback(() => {
    setError(null)
    setEditing(true)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setError(null)
  }, [])

  const saveEdit = useCallback((content: string) => {
    try {
      const parsed = JSON.parse(content)
      setEditing(false)
      setError(null)
      onChange?.(parsed)
    } catch (e) {
      setError((e as SyntaxError).message)
    }
  }, [onChange])

  const monoFont = "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', monospace"

  if (editing) {
    return (
      <div>
        <CodeMirrorJsonEditor
          doc={JSON.stringify(data, null, 2)}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
        {error && <div className="mt-0.5 px-2 py-0.5 text-[10px] text-destructive bg-destructive/10 rounded">{error}</div>}
      </div>
    )
  }

  return (
    <div className="mt-1 group/json relative rounded bg-muted/50 overflow-hidden">
      <pre
        className="max-h-80 overflow-auto p-2 text-[11px] leading-tight whitespace-pre-wrap break-all"
        style={{ fontFamily: monoFont }}
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
