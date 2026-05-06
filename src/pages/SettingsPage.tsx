import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Eye, EyeOff, Save, Loader2, Zap, CheckCircle2, XCircle, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getSettings, updateSettings, testLlmConnection, type SettingsData, type LlmProvider, type LlmTestResult } from '@/api/settings'
import { toast } from '@/stores/toastStore'

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '中文' },
]

function ProviderCard({
  title,
  description,
  provider,
  providerKey,
  showKey,
  onToggleKey,
  onChange,
  onTest,
  testing,
  testResult,
}: {
  title: string
  description: string
  provider: LlmProvider
  providerKey: string
  showKey: boolean
  onToggleKey: () => void
  onChange: (field: keyof LlmProvider, value: string) => void
  onTest: () => void
  testing: boolean
  testResult: LlmTestResult | null
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5 pt-0">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('settings.base_url')}</label>
          <Input
            value={provider.base_url}
            onChange={(e) => onChange('base_url', e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('settings.api_key')}</label>
          <div className="flex gap-2">
            <Input
              type={showKey ? 'text' : 'password'}
              value={provider.api_key}
              onChange={(e) => onChange('api_key', e.target.value)}
              placeholder="sk-..."
              className="h-8 text-sm"
            />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onToggleKey}>
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">{t('settings.model')}</label>
          <Input
            value={provider.model}
            onChange={(e) => onChange('model', e.target.value)}
            placeholder="gpt-4o"
            className="h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={testing || !provider.base_url || !provider.api_key || !provider.model}
            className="h-7 text-xs"
          >
            {testing ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Zap className="mr-1.5 h-3 w-3" />}
            {t('settings.test_connection')}
          </Button>

          {testResult && !testing && (
            <div className="flex items-center gap-1.5 text-xs">
              {testResult.success ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-success">
                    {t('settings.test_success')} ({testResult.latency_ms}ms)
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive">
                    {testResult.error || t('settings.test_failed')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [language, setLanguage] = useState(i18n.language || 'en-US')
  const [llmVlm, setLlmVlm] = useState<LlmProvider>({ base_url: '', api_key: '', model: '' })
  const [llmChat, setLlmChat] = useState<LlmProvider>({ base_url: '', api_key: '', model: '' })
  const [llmImage, setLlmImage] = useState<LlmProvider>({ base_url: '', api_key: '', model: '' })
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [testingVlm, setTestingVlm] = useState(false)
  const [testingChat, setTestingChat] = useState(false)
  const [testingImage, setTestingImage] = useState(false)
  const [testResultVlm, setTestResultVlm] = useState<LlmTestResult | null>(null)
  const [testResultChat, setTestResultChat] = useState<LlmTestResult | null>(null)
  const [testResultImage, setTestResultImage] = useState<LlmTestResult | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const data = await getSettings()
      setLanguage(data.language || i18n.language || 'en-US')
      setLlmVlm(data.llm_vlm || { base_url: '', api_key: '', model: '' })
      setLlmChat(data.llm_chat || { base_url: '', api_key: '', model: '' })
      setLlmImage(data.llm_image || { base_url: '', api_key: '', model: '' })
    } catch {
      // keep defaults
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleLanguageChange = (code: string) => {
    setLanguage(code)
    i18n.changeLanguage(code)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings({
        language,
        llm_vlm: llmVlm,
        llm_chat: llmChat,
        llm_image: llmImage,
      })
      toast.success(t('settings.save_success'))
    } catch {
      toast.error(t('settings.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (
    providerKey: string,
    config: LlmProvider,
    setTesting: (v: boolean) => void,
    setResult: (r: LlmTestResult) => void,
  ) => {
    setTesting(true)
    try {
      const result = await testLlmConnection(providerKey.replace('llm_', ''), config)
      setResult(result)
      if (result.success) {
        toast.success(`${t('settings.test_success')} (${result.latency_ms}ms)`)
      } else {
        toast.error(result.error || t('settings.test_failed'))
      }
    } catch {
      toast.error(t('settings.test_failed'))
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('settings.save')}
        </Button>
      </div>

      {/* Language */}
      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4" />
            {t('settings.language')}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <Button
                key={lang.code}
                variant={language === lang.code ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleLanguageChange(lang.code)}
              >
                {lang.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Provider cards */}
      <ProviderCard
        title={t('settings.provider_vlm')}
        description={t('settings.provider_vlm_desc')}
        provider={llmVlm}
        providerKey="llm_vlm"
        showKey={showKeys.vlm ?? false}
        onToggleKey={() => setShowKeys((s) => ({ ...s, vlm: !s.vlm }))}
        onChange={(field, value) => setLlmVlm((p) => ({ ...p, [field]: value }))}
        onTest={() => handleTest('llm_vlm', llmVlm, setTestingVlm, setTestResultVlm)}
        testing={testingVlm}
        testResult={testResultVlm}
      />

      <ProviderCard
        title={t('settings.provider_chat')}
        description={t('settings.provider_chat_desc')}
        provider={llmChat}
        providerKey="llm_chat"
        showKey={showKeys.chat ?? false}
        onToggleKey={() => setShowKeys((s) => ({ ...s, chat: !s.chat }))}
        onChange={(field, value) => setLlmChat((p) => ({ ...p, [field]: value }))}
        onTest={() => handleTest('llm_chat', llmChat, setTestingChat, setTestResultChat)}
        testing={testingChat}
        testResult={testResultChat}
      />

      <ProviderCard
        title={t('settings.provider_image')}
        description={t('settings.provider_image_desc')}
        provider={llmImage}
        providerKey="llm_image"
        showKey={showKeys.image ?? false}
        onToggleKey={() => setShowKeys((s) => ({ ...s, image: !s.image }))}
        onChange={(field, value) => setLlmImage((p) => ({ ...p, [field]: value }))}
        onTest={() => handleTest('llm_image', llmImage, setTestingImage, setTestResultImage)}
        testing={testingImage}
        testResult={testResultImage}
      />
    </div>
  )
}
