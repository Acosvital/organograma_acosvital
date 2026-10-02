import { blogGet, WELCOME_CACHE_TAG } from '@/lib/apiClient';

export interface WelcomePreset {
  id: string;
  nomeCliente: string;
  logoUrl: string | null;
  corInicio: string | null;
  corFim: string | null;
}

// A API do blog devolveu welcome-settings em camelCase (não snake_case como
// o contrato original documentava) — aceita as duas grafias aqui até
// confirmar o shape real de um preset em produção (a lista está vazia hoje).
interface RawWelcomePreset {
  id: string;
  nomeCliente?:  string;
  nome_cliente?: string;
  logoUrl?:      string | null;
  logo_url?:     string | null;
  corInicio?:    string | null;
  cor_inicio?:   string | null;
  corFim?:       string | null;
  cor_fim?:      string | null;
}

function toWelcomePreset(raw: RawWelcomePreset): WelcomePreset {
  return {
    id:          raw.id,
    nomeCliente: raw.nomeCliente ?? raw.nome_cliente ?? '',
    logoUrl:     raw.logoUrl   ?? raw.logo_url   ?? null,
    corInicio:   raw.corInicio ?? raw.cor_inicio ?? null,
    corFim:      raw.corFim    ?? raw.cor_fim    ?? null,
  };
}

/** Lista completa de presets cadastrados (sem paginação — poucas dezenas no máximo). */
export async function getWelcomePresetsList(): Promise<WelcomePreset[]> {
  const raw = await blogGet<RawWelcomePreset[]>('/api/welcome-presets', undefined, WELCOME_CACHE_TAG);
  return raw.map(toWelcomePreset);
}
