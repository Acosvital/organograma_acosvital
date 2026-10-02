/**
 * Utilitários puros para manipulação da árvore do organograma.
 * Nenhuma função aqui faz I/O — são transformações de dados puras.
 */

import type { OrgNode } from '@/types/orgChart';

/**
 * Gera um ID único com prefixo para identificar o tipo de nó.
 * Ex.: "person-lf3k2-ab9c", "sector-lf3k4-xy12"
 */
export function generateNodeId(prefix: 'person' | 'sector' | 'subsector' | 'director' | 'manager'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Extrai as iniciais de até 2 palavras de um nome.
 * Ex.: "João da Silva" → "JS"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();
}

/**
 * Coleta recursivamente os IDs de um nó e todos os seus descendentes.
 * Usado para operações em cascata (ex.: contagem, remoção).
 */
export function collectSubtreeIds(rootId: string, allNodes: OrgNode[]): Set<string> {
  const ids = new Set<string>();

  function traverse(nodeId: string) {
    ids.add(nodeId);
    allNodes
      .filter(n => n.parentId === nodeId)
      .forEach(child => traverse(child.id));
  }

  traverse(rootId);
  return ids;
}

/**
 * Conta quantas pessoas (não-setores) existem na subárvore de um setor,
 * excluindo o próprio setor.
 */
export function countSectorMembers(sectorId: string, allNodes: OrgNode[]): number {
  const subtreeIds = collectSubtreeIds(sectorId, allNodes);
  return allNodes.filter(n => subtreeIds.has(n.id) && !n.isSector && n.id !== sectorId).length;
}

/** Minúsculas e sem acento — pra busca achar "João" digitando "joao" (o
 *  teclado virtual do totem não tem teclas de acento). */
export function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
