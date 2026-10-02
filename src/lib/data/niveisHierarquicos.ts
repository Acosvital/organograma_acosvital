import { apiGet, extractArray } from '@/lib/apiClient';
import { levelNames as FALLBACK_NAMES, levelColors as FALLBACK_COLORS } from '@/data/orgData';

interface NivelHierarquicoApi {
  nivel: number;
  nome: string;
  cor: string;
  categoria: 'estrutural' | 'pessoa';
  ativo: boolean;
}

export interface NiveisHierarquicos {
  levelNames: Record<number, string>;
  levelColors: Record<number, string>;
}

/**
 * Busca o dicionário de níveis hierárquicos em GET /niveis_hierarquicos —
 * fonte única compartilhada com o av-hub (ver
 * docs/organograma-integridade-schema.md, item 1). Substitui o dicionário
 * hardcoded que existia aqui; `orgData.ts` vira só o fallback usado se a
 * rota falhar ou vier vazia, pra uma instabilidade nesse endpoint não
 * derrubar o organograma inteiro.
 */
export async function getNiveisHierarquicos(): Promise<NiveisHierarquicos> {
  try {
    const raw = await apiGet<unknown>('/niveis_hierarquicos');
    const rows = extractArray(raw, 'data') as NivelHierarquicoApi[];
    if (rows.length === 0) throw new Error('resposta vazia');

    const levelNames: Record<number, string> = {};
    const levelColors: Record<number, string> = {};
    for (const n of rows) {
      if (!n.ativo) continue;
      levelNames[n.nivel] = n.nome;
      levelColors[n.nivel] = n.cor;
    }
    return { levelNames, levelColors };
  } catch (err) {
    console.error('[niveisHierarquicos] falha ao buscar dicionário, usando fallback local:', err);
    return { levelNames: FALLBACK_NAMES, levelColors: FALLBACK_COLORS };
  }
}
