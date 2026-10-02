import type { OrgNode } from '@/types/orgChart';

/**
 * Setor 100% fake, só pra testar mudanças de layout (ex.: a segunda passada
 * de compactação de fatias) sem tocar em dado real. Reproduz a MESMA forma
 * de árvore da Expedição real (1 coordenador, 4 líderes com 15 analistas no
 * total, e uma cadeia estreita de 3 níveis até 6 auxiliares) — é essa forma
 * que expôs o bug de overlap original, então é o melhor caso pra testar
 * qualquer ajuste no algoritmo de anéis.
 *
 * Ativado só com MOCK_TEST_SECTOR=true no .env.local (nunca em produção, ver
 * mesmo padrão de DEV_AUTH_BYPASS em src/lib/devAuth.ts). Remover este
 * arquivo e a chamada em getOrgNodes() quando o teste acabar.
 */
export const MOCK_TEST_SECTOR_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.MOCK_TEST_SECTOR === 'true';

const P = 'mock-teste-'; // prefixo — nunca colide com uuid real

/**
 * Gera o setor de teste, pendurado como filho do setor `parentSectorId`.
 * `unidadeId` precisa ser carimbado em cada pessoa — o client filtra nós por
 * `unidadeId` (ver OrgChart.tsx), então sem isso o setor aparece vazio.
 */
export function buildMockTestSector(parentSectorId: string, unidadeId: string): OrgNode[] {
  const nodes: OrgNode[] = [];
  const push = (n: OrgNode) => { nodes.push({ ...n, unidadeId }); return n; };

  push({ id: `${P}setor`, name: 'Expedição (Teste)', role: 'TST', level: 3, parentId: parentSectorId, isSector: true, sectorColor: '#3b82f6' });

  push({ id: `${P}coord`, name: 'Teste Coordenador 1', role: 'Coordenador', level: 6, parentId: `${P}setor` });

  const lideres = [
    { id: `${P}lider-1`, name: 'Teste Líder 1', filhos: 3 },
    { id: `${P}lider-2`, name: 'Teste Líder 2', filhos: 4 },
    { id: `${P}lider-3`, name: 'Teste Líder 3', filhos: 4 },
    { id: `${P}lider-4`, name: 'Teste Líder 4', filhos: 4 },
    // Líder com MUITA gente — força o modo coluna a valer pra esse ramo
    // sozinho (30 > RING_GROUP_THRESHOLD), pra ver como ele se comporta em
    // escala, não só com poucos filhos por coluna.
    { id: `${P}lider-5`, name: 'Teste Líder 5', filhos: 30 },
  ];

  let analistaCount = 0;
  let ultimoAnalistaDoLider4 = '';
  let ultimoAnalistaDoLider5 = '';
  let meioAnalistaDoLider5 = '';
  lideres.forEach((lider) => {
    push({ id: lider.id, name: lider.name, role: 'Líder de Expedição', level: 8, parentId: `${P}coord` });
    for (let i = 1; i <= lider.filhos; i++) {
      analistaCount++;
      const id = `${P}analista-${analistaCount}`;
      push({ id, name: `Teste Analista ${analistaCount}`, role: 'Conferente', level: 9, parentId: lider.id });
      if (lider.id === `${P}lider-4` && i === lider.filhos) ultimoAnalistaDoLider4 = id;
      if (lider.id === `${P}lider-5` && i === lider.filhos) ultimoAnalistaDoLider5 = id;
      if (lider.id === `${P}lider-5` && i === Math.ceil(lider.filhos / 2)) meioAnalistaDoLider5 = id;
    }
  });

  // Cadeia estreita de 3 níveis (líder → analista → assistente) até o grupo
  // de 6 auxiliares — é essa profundidade que fazia o orçamento angular
  // herdado ficar pequeno demais (ver fix em radialLayout.ts/packGroup).
  push({ id: `${P}assistente`, name: 'Teste Assistente 1', role: 'Auxiliar de Separação e Expedição', level: 10, parentId: ultimoAnalistaDoLider4 });

  for (let i = 1; i <= 6; i++) {
    push({ id: `${P}auxiliar-${i}`, name: `Teste Auxiliar ${i}`, role: 'Auxiliar de Logística', level: 11, parentId: `${P}assistente` });
  }

  // Segundo ramo estreito, vizinho do primeiro (ambos filhos do Líder 4) —
  // pra testar dois ramos concorrendo por espaço lado a lado, não só um
  // ramo isolado sobrando espaço à vontade.
  for (let i = 1; i <= 6; i++) {
    push({ id: `${P}filho14-${i}`, name: `Teste Filho ${i}`, role: 'Auxiliar de Logística', level: 10, parentId: `${P}analista-14` });
  }

  // Líder 5 tem 30 filhos → cai em modo coluna sozinho. Dois deles (meio e
  // último da coluna) ganham cadeias profundas próprias, pra ver se o modo
  // coluna aguenta ramos estreitos DENTRO de um leque grande, não só poucos
  // filhos rasos como nos líderes 1-4.
  for (let i = 1; i <= 8; i++) {
    push({ id: `${P}fundo5a-${i}`, name: `Teste Fundo A${i}`, role: 'Auxiliar de Logística', level: 10, parentId: meioAnalistaDoLider5 });
  }
  for (let i = 1; i <= 8; i++) {
    push({ id: `${P}fundo5b-${i}`, name: `Teste Fundo B${i}`, role: 'Auxiliar de Logística', level: 10, parentId: ultimoAnalistaDoLider5 });
  }

  return nodes;
}
