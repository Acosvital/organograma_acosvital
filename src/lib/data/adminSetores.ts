import { fetchAllPages } from '@/lib/apiClient';
import type { Setor } from '@/types/adminCore';

export function getSetoresList(): Promise<Setor[]> {
  return fetchAllPages<Setor>('/setores', 'setores');
}
