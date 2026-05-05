import { invoke } from '@tauri-apps/api/core'

export interface LlmProvider {
  base_url: string
  api_key: string
  model: string
}

export interface SettingsData {
  llm_provider: LlmProvider
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
  llm_provider: {
    base_url: '',
    api_key: '',
    model: 'mimo-v2.5',
  },
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
  // Always save to localStorage first (works offline)
  const current = loadLocal() ?? DEFAULTS
  const merged: SettingsData = {
    ...current,
    ...data,
    llm_provider: { ...current.llm_provider, ...(data.llm_provider ?? {}) },
  }
  saveLocal(merged)

  // Try to sync to backend
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
  multimodal_capable: boolean
  latency_ms: number
  error: string | null
  details: Record<string, unknown>
}

export async function testLlmConnection(): Promise<LlmTestResult> {
  return invoke<LlmTestResult>('test_llm_connection')
}
