import { useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { linter, lintGutter } from '@codemirror/lint'
import { foldGutter, indentOnInput, bracketMatching, foldKeymap } from '@codemirror/language'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { useSceneStore } from '@/stores/sceneStore'
import { Button } from '@/components/ui/button'
import { AlignLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

function jsonLinter(view: EditorView) {
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
    return [{
      from: line.from,
      to: line.to,
      severity: 'error' as const,
      message: msg,
    }]
  }
}

export function SceneJsonEditor() {
  const { t } = useTranslation()
  const homeScene = useSceneStore((s) => s.homeScene)
  const lastEditorChange = useSceneStore((s) => s.lastEditorChange)
  const setHomeScene = useSceneStore((s) => s.setHomeScene)
  const projectId = useSceneStore((s) => s.projectId)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const prevLastEditorChangeRef = useRef(lastEditorChange)
  const isUpdatingRef = useRef(false)

  const [parseError, setParseError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState(false)

  // Debounced parse + push to store
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<string>('')

  const applyContentToStore = useCallback((content: string) => {
    try {
      const parsed = JSON.parse(content)
      if (!parsed.schema_version || !Array.isArray(parsed.rooms)) {
        setParseError('Missing required fields: schema_version, rooms')
        setIsValid(false)
        return
      }
      setParseError(null)
      setIsValid(true)
      setHomeScene(parsed, 'editor')
    } catch (e) {
      setParseError((e as SyntaxError).message)
      setIsValid(false)
    }
  }, [setHomeScene])

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged || isUpdatingRef.current) return
      const content = update.state.doc.toString()
      pendingContentRef.current = content

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        applyContentToStore(pendingContentRef.current)
      }, 300)

      // Immediate syntax check
      try {
        JSON.parse(content)
        setParseError(null)
        setIsValid(true)
      } catch (e) {
        setParseError((e as SyntaxError).message)
        setIsValid(false)
      }
    })

    const isReadOnly = projectId === null

    const theme = EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '12px',
        backgroundColor: 'transparent',
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '4px 0',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
      },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--foreground)',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--primary) 25%, transparent) !important',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--primary) 25%, transparent) !important',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'color-mix(in srgb, var(--primary) 20%, transparent)',
        outline: 'none',
      },
      '.cm-lintPoint-error::after': {
        borderBottomColor: 'var(--destructive)',
      },
      '.cm-tooltip.cm-tooltip-lint': {
        backgroundColor: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '4px 8px',
      },
    })

    const initialContent = homeScene ? JSON.stringify(homeScene, null, 2) : '{}'

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          json(),
          linter(jsonLinter, { delay: 500 }),
          lintGutter(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          theme,
          updateListener,
          EditorView.editable.of(!isReadOnly),
        ],
      }),
    })

    viewRef.current = view
    setIsValid(true)

    return () => {
      view.destroy()
      viewRef.current = null
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Anti-loop: sync external changes (3D edits, scene load) to editor
  useEffect(() => {
    if (!viewRef.current) return
    const editorChangedThisFrame = lastEditorChange !== prevLastEditorChangeRef.current
    prevLastEditorChangeRef.current = lastEditorChange

    if (editorChangedThisFrame) return // Editor caused this change — skip push-back

    if (homeScene) {
      const formatted = JSON.stringify(homeScene, null, 2)
      if (viewRef.current.state.doc.toString() !== formatted) {
        isUpdatingRef.current = true
        viewRef.current.dispatch({
          changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted }
        })
        isUpdatingRef.current = false
        setParseError(null)
        setIsValid(true)
      }
    }
  }, [homeScene, lastEditorChange])

  const handleFormat = useCallback(() => {
    if (!viewRef.current || !homeScene) return
    const formatted = JSON.stringify(homeScene, null, 2)
    isUpdatingRef.current = true
    viewRef.current.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: formatted }
    })
    isUpdatingRef.current = false
    setParseError(null)
    setIsValid(true)
  }, [homeScene])

  const isReadOnly = projectId === null

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-1.5">
          {isValid ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={cn('text-[11px]', isValid ? 'text-success' : 'text-destructive')}>
            {parseError ? parseError.slice(0, 60) : t('editor.valid')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isReadOnly && (
            <span className="text-[10px] text-muted-foreground">{t('editor.read_only')}</span>
          )}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleFormat}>
            <AlignLeft className="mr-1 h-3 w-3" />
            {t('editor.format')}
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden rounded border" />
    </div>
  )
}
