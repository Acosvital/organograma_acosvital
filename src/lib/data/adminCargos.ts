import { fetchAllPages } from '@/lib/apiClient';
import type { Cargo } from '@/types/adminCore';

export function getCargosList(): Promise<Cargo[]> {
  return fetchAllPages<Cargo>('/cargos', 'cargos');
}
