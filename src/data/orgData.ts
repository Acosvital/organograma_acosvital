/**
 * Fallback local do dicionário de níveis hierárquicos — usado só se
 * GET /niveis_hierarquicos falhar ou vier vazio (ver
 * src/lib/data/niveisHierarquicos.ts e
 * docs/organograma-integridade-schema.md, item 1). A fonte de verdade
 * agora é a API, compartilhada com o av-hub; este dicionário existe
 * apenas pra uma instabilidade nesse endpoint não derrubar o organograma.
 *
 * Nível 0  = Diretoria (centro)
 * Nível 1  = Gerência Geral
 * Nível 2  = Setor (nó estrutural, isSector=true)
 * Nível 3  = Sub-setor (nó estrutural, isSector=true, sempre nível 3)
 * Nível 4  = Diretor de Setor (pessoa, parentId=setor)
 * Níveis 5–12 = cargos dentro de setores, em ordem decrescente de senioridade
 * Nível 13 = Diretoria Executiva (pessoa; anel entre a Diretoria e a Gerência
 *            Geral — o número é só identificador, a posição vem de
 *            OVERVIEW_RING_RADII_EXEC em radialLayout.ts)
 */
export const levelNames: Record<number, string> = {
  0:  'Diretoria',
  1:  'Gerência Geral',
  2:  'Setor',
  3:  'Sub-setor',
  4:  'Diretor de Setor',
  5:  'Gerência de Setor',
  6:  'Coordenação',
  7:  'Supervisão',
  8:  'Líder de Equipe',
  9:  'Analista / Técnico',
  10: 'Assistente / Auxiliar',
  11: 'Auxiliar / Estagiário',
  12: 'Aprendiz',
  13: 'Diretoria Executiva',
};

/**
 * Posição de cada nível na hierarquia (menor = mais alto). `nivel` é só o
 * identificador (= core.cargos.nvl_permissao) e não diz a ordem: a Diretoria
 * Executiva é o nível 13, mas fica entre a Diretoria (0) e a Gerência Geral (1).
 * Fonte real: coluna `ordem` de GET /niveis_hierarquicos (ver
 * docs/organograma-niveis-ordem-schema.md); este é o fallback. Múltiplos de 10
 * deixam espaço pra encaixar um nível novo entre dois existentes.
 */
export const levelOrder: Record<number, number> = {
  0: 0, 13: 5, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50,
  6: 60, 7: 70, 8: 80, 9: 90, 10: 100, 11: 110, 12: 120,
};

/** Ordem de um nível; sem `ordem` cadastrada vale nivel * 10 (a mesma escala do fallback). */
export const ordemDoNivel = (nivel: number, order: Record<number, number>): number =>
  order[nivel] ?? nivel * 10;

export const levelColors: Record<number, string> = {
  0:  '#f59e0b',  // amber
  1:  '#3b82f6',  // blue
  2:  '#a78bfa',  // purple
  3:  '#7c3aed',  // violet (sub-sector)
  4:  '#f59e0b',  // amber (same authority as director)
  5:  '#6366f1',  // indigo
  6:  '#8b5cf6',  // violet
  7:  '#d946ef',  // fuchsia
  8:  '#ec4899',  // pink
  9:  '#10b981',  // emerald
  10: '#14b8a6',  // teal
  11: '#06b6d4',  // cyan
  12: '#94a3b8',  // slate (nível mais júnior)
  13: '#f43f5e',  // rose (Diretoria Executiva)
};
