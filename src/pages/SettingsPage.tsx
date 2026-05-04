import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Save, Loader2, Zap, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getSettings, updateSettings, testLlmConnection, type SettingsData, type LlmTestResult } from '@/api/settings'

const LLM_MODELS = [
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'mimo-v2',
  'mimo-v2-pro',
  'mimo-v2-omni',
]

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive" />
      )}
      <span className={ok ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>{label}</span>
    </div>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('mimo-v2.5')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const data = await getSettings()
      setBaseUrl(data.llm_provider?.base_url || '')
      setApiKey(data.llm_provider?.api_key || '')
      setModel(data.llm_provider?.model || 'mimo-v2.5')
    } catch {
      // Backend unavailable — keep defaults
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const data: Partial<SettingsData> = {
        llm_provider: { base_url: baseUrl, api_key: apiKey, model },
      }
      const result = await updateSettings(data)
      // Update apiKey with masked version from server
      setApiKey(result.llm_provider.api_key)
      setMessage({ type: 'success', text: t('settings.save_success') })
    } catch {
      setMessage({ type: 'error', text: t('settings.save_failed') })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setMessage(null)
    try {
      const result = await testLlmConnection()
      setTestResult(result)
      if (!result.success) {
        setMessage({ type: 'error', text: result.error || t('settings.test_failed') })
      }
    } catch {
      setMessage({ type: 'error', text: t('settings.test_failed') })
    } finally {
      setTesting(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.llm_provider')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.base_url')}</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.api_key')}</label>
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('settings.model')}</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {LLM_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {message && (
            <div
              className={`rounded-md px-4 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('settings.save')}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing || !baseUrl || !apiKey}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              {t('settings.test_connection')}
            </Button>
          </div>

          {testResult && (
            <div className="rounded-md border p-4 space-y-2">
              <h4 className="text-sm font-medium">{t('settings.test_results')}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <StatusRow label={t('settings.test_api')} ok={testResult.api_reachable} />
                <StatusRow label={t('settings.test_model')} ok={testResult.model_available} />
                <StatusRow label={t('settings.test_multimodal')} ok={testResult.multimodal_capable} />
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">{t('settings.test_latency')}:</span>
                  <span className="font-mono">{testResult.latency_ms}ms</span>
                </div>
              </div>
              {testResult.error && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {testResult.error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
