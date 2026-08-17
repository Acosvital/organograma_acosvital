import { useCallback } from 'react';
import type { Unidade } from '@/types/adminCore';

/**
 * Filtra uma lista para a unidade selecionada (ou retorna a lista completa
 * quando a tela não está escopada a uma unidade específica). O campo de
 * escopo (Cargo/Setor/Funcionario.codigo_empresa) sempre guarda o Unidade.id.
 */
export function useUnidadeScoped<T>(unidade: Unidade | undefined, getScopeValue: (item: T) => string | null | undefined) {
  return useCallback(
    (list: T[]) => (unidade ? list.filter(item => getScopeValue(item) === unidade.id) : list),
    [unidade, getScopeValue],
  );
}
