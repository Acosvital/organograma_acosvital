import { fetchAllPages } from '@/lib/apiClient';
import type { Unidade } from '@/types/adminCore';

/** Lista de unidades para a tela de seleção do organograma. */
export function getUnidadesList(): Promise<Unidade[]> {
  return fetchAllPages<Unidade>('/unidades', 'unidades');
}

/**
 * Código usado para rotear/vincular uma unidade na área administrativa.
 * `codigo_empresa` só existe após a sincronização com a API externa — até lá,
 * usa o próprio id da unidade para que ela já possa ser administrada.
 * Checa string vazia explicitamente (em vez de `||`) para não cair no
 * fallback caso a API externa algum dia devolva um código "falsy" válido.
 */
export function getUnidadeCodigo(u: Unidade): string {
  const codigo = u.codigo_empresa;
  return typeof codigo === 'string' && codigo.trim() !== '' ? codigo : u.id;
}

/**
 * Verifica se um valor de escopo (Cargo.codigo_empresa, Setor.id_unidade, ou o
 * segmento de URL /admin/unidade/[codigo]) pertence a esta unidade. Aceita
 * tanto o código real quanto o id interno — usado como código enquanto a
 * unidade não foi sincronizada (ver getUnidadeCodigo) — para que links e
 * registros criados antes da sincronização não fiquem órfãos quando ela
 * preencher codigo_empresa depois.
 */
export function matchesUnidade(value: string | null | undefined, u: Unidade): boolean {
  if (!value) return false;
  return value === u.id || (!!u.codigo_empresa && value === u.codigo_empresa);
}

/** Resolve a Unidade correspondente ao segmento /admin/unidade/[codigo] dentro de uma lista já carregada. */
export function resolveUnidade(unidades: Unidade[], codigo: string): Unidade | undefined {
  return unidades.find(u => matchesUnidade(codigo, u));
}

/** Busca e resolve a Unidade correspondente ao segmento /admin/unidade/[codigo] da URL. */
export async function findUnidadeByCodigo(codigo: string): Promise<Unidade | undefined> {
  const unidades = await getUnidadesList().catch(() => []);
  return resolveUnidade(unidades, codigo);
}
