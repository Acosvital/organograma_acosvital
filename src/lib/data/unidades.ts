import { fetchAllPages } from '@/lib/apiClient';
import type { Unidade } from '@/types/adminCore';

/** Lista de unidades para a tela de seleção do organograma. */
export function getUnidadesList(): Promise<Unidade[]> {
  return fetchAllPages<Unidade>('/unidades', 'unidades');
}

/** Resolve a Unidade correspondente ao segmento /admin/unidade/[codigo] dentro de uma lista já carregada.
 *  O segmento é o próprio Unidade.id — é também o valor gravado em
 *  Cargo.codigo_empresa / Setor.codigo_empresa / Funcionario.codigo_empresa. */
export function resolveUnidade(unidades: Unidade[], codigo: string): Unidade | undefined {
  return unidades.find(u => u.id === codigo);
}

/** Busca e resolve a Unidade correspondente ao segmento /admin/unidade/[codigo] da URL. */
export async function findUnidadeByCodigo(codigo: string): Promise<Unidade | undefined> {
  const unidades = await getUnidadesList().catch(() => []);
  return resolveUnidade(unidades, codigo);
}
