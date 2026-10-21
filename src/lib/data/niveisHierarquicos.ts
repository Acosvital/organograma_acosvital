import { apiGet, extractArray } from '@/lib/apiClient';
import {
  levelNames as FALLBACK_NAMES,
  levelColors as FALLBACK_COLORS,
  levelOrder as FALLBACK_ORDER,
} from '@/data/orgData';

interface NivelHierarquicoApi {
  nivel: number;
  nome: string;
  cor: string;
  categoria: 'estrutural' | 'pessoa';
  /** Posição na hierarquia (menor = mais alto). Opcional: API anterior à coluna `ordem` não manda. */
  ordem?: number;
  ativo: boolean;
}

export interface NiveisHierarquicos {
  levelNames: Record<number, string>;
  levelColors: Record<number, string>;
  /** nivel → ordem na hierarquia (ver ordemDoNivel). */
  levelOrder: Record<number, number>;
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
    const levelOrder: Record<number, number> = {};
    for (const n of rows) {
      if (!n.ativo) continue;
      levelNames[n.nivel] = n.nome;
      levelColors[n.nivel] = n.cor;
      // Sem `ordem` na API (deploy do frontend antes da coluna): usa a do fallback.
      levelOrder[n.nivel] = n.ordem ?? FALLBACK_ORDER[n.nivel] ?? n.nivel * 10;
    }
    return { levelNames, levelColors, levelOrder };
  } catch (err) {
    console.error('[niveisHierarquicos] falha ao buscar dicionário, usando fallback local:', err);
    return { levelNames: FALLBACK_NAMES, levelColors: FALLBACK_COLORS, levelOrder: FALLBACK_ORDER };
  }
}
