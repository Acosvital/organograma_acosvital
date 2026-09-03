import { apiGet, WELCOME_CACHE_TAG } from '@/lib/apiClient';

export interface WelcomeSettings {
  enabled: boolean;
  activePresetId: string | null;
}

interface RawWelcomeSettings {
  enabled: boolean;
  active_preset_id: string | null;
}

/** Configuração (singleton) da tela de boas-vindas pós-login. */
export async function getWelcomeSettings(): Promise<WelcomeSettings> {
  const raw = await apiGet<RawWelcomeSettings>('/welcome-settings', undefined, WELCOME_CACHE_TAG);
  return { enabled: raw.enabled, activePresetId: raw.active_preset_id };
}
