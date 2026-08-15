import { useCallback } from 'react';
import type { Unidade } from '@/types/adminCore';
import { matchesUnidade } from '@/lib/data/unidades';

/**
 * Filtra uma lista para a unidade selecionada (ou retorna a lista completa
 * quando a tela não está escopada a uma unidade específica).
 */
export function useUnidadeScoped<T>(unidade: Unidade | undefined, getScopeValue: (item: T) => string | null | undefined) {
  return useCallback(
    (list: T[]) => (unidade ? list.filter(item => matchesUnidade(getScopeValue(item), unidade)) : list),
    [unidade, getScopeValue],
  );
}
