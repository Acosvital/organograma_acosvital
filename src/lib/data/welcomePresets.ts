import { apiGet, WELCOME_CACHE_TAG } from '@/lib/apiClient';

export interface WelcomePreset {
  id: string;
  nomeCliente: string;
  logoUrl: string | null;
  corInicio: string | null;
  corFim: string | null;
}

interface RawWelcomePreset {
  id: string;
  nome_cliente: string;
  logo_url: string | null;
  cor_inicio: string | null;
  cor_fim: string | null;
}

function toWelcomePreset(raw: RawWelcomePreset): WelcomePreset {
  return {
    id:          raw.id,
    nomeCliente: raw.nome_cliente,
    logoUrl:     raw.logo_url,
    corInicio:   raw.cor_inicio,
    corFim:      raw.cor_fim,
  };
}

/** Lista completa de presets cadastrados (sem paginação — poucas dezenas no máximo). */
export async function getWelcomePresetsList(): Promise<WelcomePreset[]> {
  const raw = await apiGet<RawWelcomePreset[]>('/welcome-presets', undefined, WELCOME_CACHE_TAG);
  return raw.map(toWelcomePreset);
}
