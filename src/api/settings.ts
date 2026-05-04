import { get, put } from './client'

export interface LlmProvider {
  base_url: string
  api_key: string
  model: string
}

export interface SettingsData {
  llm_provider: LlmProvider
}

export async function getSettings(): Promise<SettingsData> {
  return get<SettingsData>('/api/settings')
}

export async function updateSettings(data: Partial<SettingsData>): Promise<SettingsData> {
  return put<SettingsData>('/api/settings', data)
}
