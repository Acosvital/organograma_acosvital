import { fetchAllPages } from '@/lib/apiClient';
import type { Unidade } from '@/types/adminCore';

/** Lista de unidades para a tela de seleção do organograma. */
export function getUnidadesList(): Promise<Unidade[]> {
  return fetchAllPages<Unidade>('/unidades', 'unidades');
}
