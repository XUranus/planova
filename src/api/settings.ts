import { invoke } from '@tauri-apps/api/core'

export interface LlmProvider {
  base_url: string
  api_key: string
  model: string
}

export interface SettingsData {
  language: string
  llm_vlm: LlmProvider
  llm_chat: LlmProvider
  llm_image: LlmProvider
}

const STORAGE_KEY = 'planova-settings'

function loadLocal(): SettingsData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveLocal(data: SettingsData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const DEFAULTS: SettingsData = {
  language: localStorage.getItem('planova-lang') || 'en-US',
  llm_vlm: { base_url: '', api_key: '', model: '' },
  llm_chat: { base_url: '', api_key: '', model: '' },
  llm_image: { base_url: '', api_key: '', model: '' },
}

export async function getSettings(): Promise<SettingsData> {
  try {
    const remote = await invoke<SettingsData>('get_settings')
    saveLocal(remote)
    return remote
  } catch {
    return loadLocal() ?? DEFAULTS
  }
}

export async function updateSettings(data: Partial<SettingsData>): Promise<SettingsData> {
  const current = loadLocal() ?? DEFAULTS
  const merged: SettingsData = {
    ...current,
    ...data,
    llm_vlm: { ...current.llm_vlm, ...(data.llm_vlm ?? {}) },
    llm_chat: { ...current.llm_chat, ...(data.llm_chat ?? {}) },
    llm_image: { ...current.llm_image, ...(data.llm_image ?? {}) },
  }
  saveLocal(merged)

  try {
    const remote = await invoke<SettingsData>('update_settings', { data: merged })
    return remote
  } catch {
    return merged
  }
}

export interface LlmTestResult {
  success: boolean
  api_reachable: boolean
  model_available: boolean
  latency_ms: number
  error: string | null
  details: Record<string, unknown>
}

export async function testLlmConnection(provider?: string, config?: LlmProvider): Promise<LlmTestResult> {
  return invoke<LlmTestResult>('test_llm_connection', {
    provider: provider ?? null,
    configOverride: config ?? null,
  })
}

export async function exportRender(screenshotBase64: string, style: string): Promise<{ success: boolean; render_path: string; render_base64: string }> {
  return invoke('export_render', { screenshotBase64, style })
}
