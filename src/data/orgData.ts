/**
 * Configuração estática dos níveis hierárquicos do organograma.
 *
 * Nível 0  = Diretoria (centro)
 * Nível 1  = Gerência Geral
 * Nível 2  = Setor (nó estrutural, isSector=true)
 * Nível 3  = Sub-setor (nó estrutural, isSector=true, sempre nível 3)
 * Nível 4  = Diretor de Setor (pessoa, parentId=setor)
 * Níveis 5–12 = cargos dentro de setores, em ordem decrescente de senioridade
 * (dicionário de 13 níveis — ver docs/organograma-hierarquia-schema.md)
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
};

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
};
