import { OrgNode, PositionedNode, Connection } from '@/types/orgChart';

// ── DEBUG: fatias angulares (temporário — visualização de packGroup) ────
// Populado a cada chamada de calculateEvenSectorLayout com o orçamento
// angular (`angle` ± `half`) que cada nó recebeu pro seu próprio leque de
// filhos. Só pra entender/depurar visualmente o empacotamento — não é
// usado por nenhuma lógica de produção.
export interface DebugWedge {
  id: string;
  name: string;
  angle: number;
  half: number;
  innerR: number;
  outerR: number;
}
export const debugWedges: DebugWedge[] = [];

// ── Overview ring radii (used for the 3-level initial view) ────────────
export const OVERVIEW_RING_RADII: Record<number, number> = {
  0: 0,    // Diretoria (center)
  1: 190,  // Gerência Geral (5 nodes)
  2: 430,  // Setores (18 nodes)
};

// ── Sector detail ring radii (BFS depth from sector node) ─────────────
export const SECTOR_RING_RADII: Record<number, number> = {
  0: 0,     // sector card (center)
  1: 150,   // Diretor de Setor       (level 4)
  2: 300,   // Gerente de Setor       (level 5)
  3: 475,   // Coordenadores          (level 6)
  4: 665,   // Supervisores           (level 7)
  5: 875,   // Líderes                (level 8)
  6: 1105,  // Analistas              (level 9)
  7: 1345,  // Assistentes            (level 10)
  8: 1590,  // Auxiliares/Estagiários (level 11)
  9: 1845,  // Aprendizes             (level 12)
};

// ── Node visual radii for overview ────────────────────────────────────
export const OVERVIEW_NODE_RADIUS: Record<number, number> = {
  0: 78,  // directors center card
  1: 28,  // GMs
  2: 36,  // sector cards (bigger — show names)
};

// ── Node visual radii for sector detail (keyed by BFS depth) ──────────
// Progressão geométrica: cada nível de depth 1 (Diretor de Setor) a 9
// (Aprendiz) encolhe pela mesma razão constante — nunca um "degrau"
// manual fora do padrão entre dois níveis vizinhos.
const SECTOR_CARD_RADIUS = 52;      // depth 0 — sector card ao centro
const DIRECTOR_RADIUS = 38;         // depth 1 — Diretor de Setor (level 4)
const APPRENTICE_RADIUS = 15;       // depth 9 — Aprendiz         (level 12)
const PERSON_DEPTH_STEPS = 8;       // depth 1 → depth 9 (8 razões aplicadas)
const PERSON_RADIUS_RATIO = Math.pow(APPRENTICE_RADIUS / DIRECTOR_RADIUS, 1 / PERSON_DEPTH_STEPS);

export const SECTOR_NODE_RADIUS: Record<number, number> = {
  0: SECTOR_CARD_RADIUS,
  ...Object.fromEntries(
    Array.from({ length: PERSON_DEPTH_STEPS + 1 }, (_, i) => [
      i + 1,
      Math.round(DIRECTOR_RADIUS * PERSON_RADIUS_RATIO ** i),
    ]),
  ),
};

// ── Helpers ────────────────────────────────────────────────────────────
function countLeaves(nodeId: string, childrenOf: Map<string, OrgNode[]>): number {
  const kids = childrenOf.get(nodeId);
  if (!kids || kids.length === 0) return 1;
  return kids.reduce((sum, kid) => sum + countLeaves(kid.id, childrenOf), 0);
}

/** Return the sector node + every descendant (BFS). */
export function getSubtree(rootId: string, allNodes: OrgNode[]): OrgNode[] {
  const childrenOf = new Map<string, OrgNode[]>();
  allNodes.forEach((n) => {
    if (!n.parentId) return;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n);
  });

  const idMap = new Map(allNodes.map((n) => [n.id, n]));
  const result: OrgNode[] = [];
  const visited = new Set<string>();
  const queue: string[] = [rootId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Tenta exato; se não achar, tenta variante com/sem prefixo 'sec-' (Supabase vs. API)
    let node = idMap.get(id);
    const altId = id.startsWith('sec-') ? id.slice(4) : `sec-${id}`;
    if (!node) node = idMap.get(altId);

    if (node) {
      // Garante que o nó raiz sempre usa o canonicalId passado (importante para detailCenter)
      result.push(node.id === id ? node : { ...node, id });
    }

    // Percorre filhos sob ambas as variantes de ID (Supabase + API externa podem divergir)
    childrenOf.get(id)?.forEach((c) => queue.push(c.id));
    if (!visited.has(altId)) childrenOf.get(altId)?.forEach((c) => queue.push(c.id));
  }

  return result;
}

// ── Layout ─────────────────────────────────────────────────────────────
export function calculateLayout(
  nodes: OrgNode[],
  ringRadii: Record<number, number> = OVERVIEW_RING_RADII,
  nodeRadii: Record<number, number> = OVERVIEW_NODE_RADIUS,
  // Optional: override which ring a node goes to (e.g. level-based instead of BFS depth)
  getDepth?: (node: OrgNode, bfsDepth: number) => number,
): PositionedNode[] {
  const childrenOf = new Map<string, OrgNode[]>();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n);
  });

  const maxDefinedDepth = Math.max(...Object.keys(nodeRadii).map(Number));
  function getNodeR(depth: number) {
    return nodeRadii[depth] ?? nodeRadii[maxDefinedDepth] ?? 8;
  }
  function getRingR(depth: number): number {
    if (ringRadii[depth] !== undefined) return ringRadii[depth];
    const maxRing = Math.max(...Object.keys(ringRadii).map(Number));
    return ringRadii[maxRing] + 200 * (depth - maxRing);
  }

  const result: PositionedNode[] = [];
  const START = -Math.PI / 2;

  // When getDepth is provided, roots whose computed depth ≠ 0 should go into
  // the BFS at their correct ring (e.g. orphaned GMs with parentId=null, level=1).
  const allRoots = nodes.filter((n) => !n.parentId);
  const trueRoots    = getDepth ? allRoots.filter((n) => getDepth(n, 0) === 0) : allRoots;
  const orphanRoots  = getDepth ? allRoots.filter((n) => getDepth(n, 0) !== 0) : [];

  // True roots at center
  trueRoots.forEach((root) => {
    result.push({ ...root, x: 0, y: 0, angle: 0, radius: getNodeR(0) });
  });

  // BFS for depth 1+: children of true roots + orphaned roots treated as depth-1 nodes
  const level1 = [
    ...trueRoots.flatMap((r) => childrenOf.get(r.id) ?? []),
    ...orphanRoots,
  ];
  if (level1.length === 0) return result;

  const totalLeaves = level1.reduce((s, n) => s + countLeaves(n.id, childrenOf), 0);

  interface QItem { node: OrgNode; depth: number; sa: number; ea: number }

  let cursor = START;
  const queue: QItem[] = level1.map((n) => {
    const leaves = countLeaves(n.id, childrenOf);
    const arc = 2 * Math.PI * (leaves / Math.max(totalLeaves, 1));
    const item: QItem = { node: n, depth: 1, sa: cursor, ea: cursor + arc };
    cursor += arc;
    return item;
  });

  while (queue.length) {
    const { node, depth, sa, ea } = queue.shift()!;
    // Use custom depth for ring/radius; BFS depth (depth+1) still drives arc splitting for children
    const d = getDepth ? getDepth(node, depth) : depth;
    const angle = (sa + ea) / 2;
    const r = getRingR(d);
    result.push({ ...node, x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle, radius: getNodeR(d) });

    const kids = childrenOf.get(node.id) ?? [];
    if (!kids.length) continue;
    const kidLeaves = kids.map((k) => countLeaves(k.id, childrenOf));
    const totalKL = Math.max(kidLeaves.reduce((s, l) => s + l, 0), 1);
    const arc = ea - sa;
    let kc = sa;
    kids.forEach((kid, i) => {
      const ka = arc * (kidLeaves[i] / totalKL);
      queue.push({ node: kid, depth: depth + 1, sa: kc, ea: kc + ka });
      kc += ka;
    });
  }

  return result;
}

// ── Overview layout (level-based even distribution) ───────────────────
/**
 * Places overview nodes evenly around their level ring.
 * All nodes at the same level share the full 360°, independent of tree structure.
 * This allows all sectors to spread evenly regardless of which GM they belong to,
 * and ensures orphaned nodes (parentId=null) land on the correct ring by level.
 */
export function calculateOverviewLayout(
  nodes: OrgNode[],
  ringRadii: Record<number, number> = OVERVIEW_RING_RADII,
  nodeRadii: Record<number, number> = OVERVIEW_NODE_RADIUS,
): PositionedNode[] {
  const START = -Math.PI / 2;
  const result: PositionedNode[] = [];

  const byLevel = new Map<number, OrgNode[]>();
  nodes.forEach((n) => {
    if (!byLevel.has(n.level)) byLevel.set(n.level, []);
    byLevel.get(n.level)!.push(n);
  });

  const maxDefinedR = Math.max(...Object.keys(nodeRadii).map(Number));

  [...byLevel.keys()].sort((a, b) => a - b).forEach((level) => {
    const levelNodes = byLevel.get(level)!;
    const r      = ringRadii[level] ?? 0;
    const nodeR  = nodeRadii[level] ?? nodeRadii[maxDefinedR] ?? 8;
    const count  = levelNodes.length;

    if (r === 0) {
      // Center ring (directors)
      levelNodes.forEach((n) =>
        result.push({ ...n, x: 0, y: 0, angle: 0, radius: nodeR }),
      );
      return;
    }

    const step = (2 * Math.PI) / count;
    levelNodes.forEach((n, i) => {
      const angle = START + step * i;
      result.push({
        ...n,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        angle,
        radius: nodeR,
      });
    });
  });

  return result;
}

// ── Sector detail: hierarchy-aware even distribution ───────────────────
/**
 * Layout for the sector detail view.
 *
 * Two modes depending on whether a ring's nodes fit around the circumference
 * (raio necessário ≤ MAX_RING_R):
 *
 * RING MODE (cabe em volta): even angular distribution, centered on
 *   each parent so "4 children of 1 parent → parent is exactly in the middle."
 *   Em setores grandes o passo é uniforme (2π/n) → preenche a circunferência.
 *
 * COLUMN MODE (não cabe em volta, ou nível com gente demais): children are stacked
 *   RADIALLY (outward) instead of tangentially. Each parent gets a "fan of columns",
 *   split as evenly as possible around COL_TARGET_SIZE per column (e.g. 23 children
 *   → 4 columns of 6/6/6/5, never an unbalanced 10/10/3). The angle between
 *   adjacent columns adapts to the arc available per parent so columns never
 *   overlap each other. This keeps large datasets (500+) compact: columns grow
 *   outward, not around.
 */
export function calculateEvenSectorLayout(
  nodes: OrgNode[],
  sectorId: string,
  ringRadii: Record<number, number> = SECTOR_RING_RADII,
  nodeRadii: Record<number, number> = SECTOR_NODE_RADIUS,
  subSectorRing?: number,
): PositionedNode[] {
  const START = -Math.PI / 2;
  const PI2   = 2 * Math.PI;
  const MIN_GAP_BASE      = 6;   // min gap between node edges in ring mode (scaled dynamically)
  const RING_ANG_GAP = 80;  // folga angular entre nós vizinhos em anéis esparsos (mais "disposto")
  // Rótulo (nome + cargo) abaixo do círculo é bem mais largo que o próprio círculo;
  // usar só o diâmetro do nó para espaçamento faz labels vizinhos se sobreporem em
  // anéis com muita gente. Estimativa de largura do rótulo renderizado — cargo
  // truncado em 22 caracteres (ver NodeCard.tsx) já chega perto de 130px no
  // tamanho de fonte usado, então 100 deixava rótulos vizinhos colarem (ex.:
  // "Conferente" perto de irmãos no mesmo anel — ver Expedição/Danillo V.).
  const LABEL_FOOTPRINT_PX = 130;
  // Passo radial FIXO entre um anel e o seguinte — igual pra qualquer par de
  // níveis vizinhos. Cobre o pior caso (raio de nó + rótulo abaixo dele nos
  // anéis mais internos, onde os círculos são maiores — ver SECTOR_NODE_RADIUS)
  // pra nunca sobrepor, mesmo nos anéis mais externos onde os nós são bem
  // menores e sobraria folga de propósito.
  const RING_STEP_BASE    = 130;  // (scaled dynamically)
  const LEVEL_BASE   = 3;   // visualR lookup: nodeRadii[level − LEVEL_BASE]
  const MAX_RING_R   = 1600; // raio máx. de um anel em modo anel; acima disso → modo coluna (40k)
  // Mesmo sem estourar MAX_RING_R, um anel com muita gente vira um círculo
  // grande e esparso em vez de compacto — acima desta contagem, agrupa em
  // colunas independente do raio caber.
  const RING_GROUP_THRESHOLD = 14;
  const LARGE_SECTOR = 40;   // a partir deste total de pessoas, espalha pela circunferência (passo uniforme)
  const COL_COUNT = 7; // número fixo de colunas; grupo dividido o mais igual possível entre elas
  const COL_ROW_PX   = 52;  // radial distance between rows in a column (px) — mínimo, ver LABEL_HEIGHT_PX
  // Nome + cargo abaixo do círculo ocupam ~40px de altura; sem isso, linhas
  // consecutivas de uma coluna ficam com o rótulo sobreposto ao próximo nó.
  const LABEL_HEIGHT_PX = 40;
  const MIN_COL_ANG  = (6  * Math.PI) / 180; // minimum 6° between columns
  const COL_LABEL_GAP = 20; // respiro entre rótulos de colunas vizinhas (px)
  const MAX_COL_ANG  = (14 * Math.PI) / 180; // maximum 14° between columns

  const maxDefinedNodeR = Math.max(...Object.keys(nodeRadii).map(Number));
  const visualR = (node: OrgNode): number => {
    if (node.id === sectorId) return nodeRadii[0] ?? 52;
    if (node.isSector)        return nodeRadii[1] ?? 38;
    const absRing = Math.max(1, node.level - LEVEL_BASE);
    return nodeRadii[absRing] ?? nodeRadii[maxDefinedNodeR] ?? 8;
  };
  // SectorCard (setor central e cards de subsetor) desenha anéis decorativos
  // (glow, tracejado, borda) além do raio "nu" — sem contar essa folga extra
  // aqui, o passo radial calculado é comido pelos próprios anéis decorativos e
  // o card parece colado no vizinho mesmo com folga "correta" no papel. Só
  // usado nos cálculos de espaçamento; o raio REALMENTE renderizado
  // (visualR, abaixo) continua o mesmo — isso não infla o card, só o respiro
  // ao redor dele.
  const SECTOR_CARD_DECOR_PAD = 10;
  const spacingR = (node: OrgNode): number =>
    visualR(node) + (node.id === sectorId || node.isSector ? SECTOR_CARD_DECOR_PAD : 0);

  // ── Caixas que um nó ocupa na tela (círculo + rótulo) ──
  // Espelha o que NodeCard desenha: círculo com borda (raio + 2) e, abaixo
  // dele, nome curto (getShortName) e cargo truncado em 22 caracteres, de
  // raio + 4 até raio + 30, com fonte 8–10 conforme o raio. A largura do
  // rótulo é estimada pelo nº de caracteres — não precisa ser exata, só não
  // subestimar (0,62 × fonte por caractere cobre a Segoe UI em negrito).
  // Serve pra checar se dois nós próximos se sobrepõem DE VERDADE em qualquer
  // direção — um passo radial fixo só vale pra coluna na vertical, onde o
  // rótulo fica entre os dois círculos (ver rowStepAlong).
  const BOX_GAP = 2; // respiro em volta de cada caixa (px) → 4px entre duas caixas
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const shortNameOf = (name: string): string => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] ?? '';
    const last = parts[parts.length - 1];
    return /^\d+$/.test(last) ? `${parts[0]} ${last}` : `${parts[0]} ${last[0]}.`;
  };
  const boxesOf = (node: OrgNode, x: number, y: number): Box[] => {
    const r = visualR(node);
    const c = r + 2 + BOX_GAP;
    const circle = { x0: x - c, x1: x + c, y0: y - c, y1: y + c };
    if (node.id === sectorId || node.isSector) return [circle];
    const font = r <= 13 ? 8 : r <= 20 ? 9 : 10;
    const roleLen = Math.min(node.role.length, 22);
    const w = Math.max(shortNameOf(node.name).length, roleLen) * 0.62 * font;
    const half = w / 2 + BOX_GAP;
    return [circle, { x0: x - half, x1: x + half, y0: y + r + 4 - BOX_GAP, y1: y + r + 30 + BOX_GAP }];
  };
  const collide = (a: Box[], b: Box[]): boolean =>
    a.some((p) => b.some((q) => p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1));

  // Passo radial de UMA coluna apontando na direção `angle`: parte do piso
  // (diâmetro + altura do rótulo — suficiente na vertical) e cresce só o
  // necessário pra nenhum par de linhas vizinhas se sobrepor. Na diagonal ou
  // na horizontal o rótulo (mais largo que alto) invadia o círculo seguinte
  // (caso: setor de teste, colunas a ~60° com o rótulo de cada analista em
  // cima do próximo; e Vendas, Abner R. → Bruno B.).
  const rowStepAlong = (col: OrgNode[], angle: number, floor: number): number => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const overlaps = (step: number) => col.some((node, i) =>
      i + 1 < col.length && collide(boxesOf(node, 0, 0), boxesOf(col[i + 1], ux * step, uy * step)),
    );
    let step = floor;
    while (step < floor * 4 && overlaps(step)) step += 2;
    return step;
  };

  // ── Build full children map ──
  const childrenOf = new Map<string, OrgNode[]>();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n);
  });
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // ── Mark descendants of direct sub-sectors as hidden (drill-down) ──
  // When subSectorRing is set, sub-sectors may have been re-parented to a manager node,
  // so we find all non-root isSector nodes instead of only direct children of sectorId.
  const directSubSectorIds = new Set(
    subSectorRing != null
      ? nodes.filter((n) => n.id !== sectorId && n.isSector).map((n) => n.id)
      : (childrenOf.get(sectorId) ?? []).filter((n) => n.isSector).map((n) => n.id),
  );
  const hiddenIds = new Set<string>();
  function markHidden(id: string) {
    for (const c of childrenOf.get(id) ?? []) {
      hiddenIds.add(c.id);
      markHidden(c.id);
    }
  }
  directSubSectorIds.forEach((id) => markHidden(id));

  // ── Espaço angular mínimo real de cada ramo (de baixo pra cima) ──
  // Antes, a fatia de cada filho era proporcional ao NÚMERO de pessoas na
  // subárvore (leafWeight) — uma proxy abstrata, não o espaço físico real.
  // Isso causava dois problemas: um pai com fatia estreita comprimia os
  // filhos abaixo do próprio piso físico (overlap real — caso: 6 auxiliares
  // sob um único assistente na Expedição), e mesmo corrigindo pra nunca
  // comprimir, dois RAMOS VIZINHOS podiam transbordar um contra o outro,
  // porque nenhum sabia do orçamento real do outro (caso: dois ramos
  // estreitos lado a lado no setor de teste).
  // requiredHalf resolve os dois de uma vez: calcula quanto espaço um nó
  // exige de verdade — o próprio piso físico (raio + rótulo + respiro no
  // ANEL DELE, ver stepOfRing), ou a SOMA do que os filhos exigem, o que for
  // maior. Isso sobe da folha até a raiz ANTES de repartir qualquer pai, então
  // quando packGroup reparte a fatia de um pai entre os filhos, o valor já é
  // exatamente o necessário — nunca precisa comprimir nem transbordar.
  // Ramos cujos filhos caem em modo coluna (ringIsColumn) também entram: a
  // coluna cresce pra fora (raio), mas o LEQUE de colunas ocupa ângulo — cada
  // coluna precisa pelo menos da largura de um rótulo (stepOfRing do anel em
  // coluna), ou do que a ponta dela exige pro próximo nível, o que for maior.
  // Antes isso ficava de fora: um líder com 30 subordinados em 7 colunas
  // reservava o mesmo que um líder com 3 (setor de teste: Líder 5 espremido
  // em 72°, rótulos sobrepostos, e o resto do círculo sobrando vazio).
  const requiredHalfCache = new Map<string, number>();
  // Fator global aplicado a todos os pisos angulares (ver "Encolhe pra caber
  // na volta" mais abaixo). 1 = sem compressão.
  let angScale = 1;
  // Mínimo de linhas por coluna antes de abrir uma coluna nova (ver
  // columnsFor e "Encolhe pra caber na volta"). 1 = comportamento padrão:
  // grupo de até COL_COUNT pessoas vira uma coluna por pessoa.
  let minRows = 1;
  function requiredHalf(id: string): number {
    const cached = requiredHalfCache.get(id);
    if (cached !== undefined) return cached;
    const node = nodeById.get(id);
    const ownRing = node ? getRing(node) : 1;
    // Fallback defensivo (não deveria disparar): piso pequeno, só pra nunca
    // devolver 0 caso o anel do próprio nó não tenha stepOfRing calculado.
    const ownFloor = angScale * (stepOfRing.get(ownRing) ?? MIN_COL_ANG) / 2;
    const kids = (childrenOf.get(id) ?? []).filter((c) => !hiddenIds.has(c.id));
    let result: number;
    if (kids.length === 0) {
      result = ownFloor;
    } else {
      const childRing = getRing(kids[0]);
      result = ringIsColumn.get(childRing)
        ? Math.max(ownFloor, columnsFor(kids).reduce((s, col) => s + columnHalf(col, childRing), 0))
        : Math.max(ownFloor, kids.reduce((s, k) => s + requiredHalf(k.id), 0));
    }
    requiredHalfCache.set(id, result);
    return result;
  }

  const hasVisibleKids = (id: string): boolean =>
    (childrenOf.get(id) ?? []).some((c) => !hiddenIds.has(c.id));

  // Divide um grupo de irmãos em colunas (modo coluna) o mais igual possível
  // (ex.: 23 em 7 colunas → 4/4/3/3/3/3/3), garantindo que quem TEM
  // subordinados fique na PONTA de uma coluna (último da coluna, mais
  // externo). Só a ponta tem espaço livre logo depois dela pro próximo
  // nível — antes, a ordem era a do cadastro, e um nó com subordinados no
  // meio da coluna (caso: Analista 30 no setor de teste) não tinha pra onde
  // abrir os filhos: eles eram distribuídos entre as pontas de OUTRAS
  // colunas e ligados ao chefe errado. As pontas com subordinados são
  // espalhadas pelas colunas (não amontoadas nas primeiras); se houver mais
  // nós com subordinados do que colunas, os excedentes ficam no meio e os
  // filhos deles se ancoram na ponta da própria coluna (ver anchorOf).
  // Nº de colunas: até COL_COUNT, mas nunca mais que `filhos / minRows` —
  // quando o setor não cabe na volta, minRows sobe e grupos pequenos
  // empilham mais fundo em vez de abrir uma coluna (= um rótulo de largura)
  // por pessoa.
  function columnsFor(children: OrgNode[]): OrgNode[][] {
    const colCount = Math.max(1, Math.min(COL_COUNT, children.length, Math.ceil(children.length / minRows)));
    const baseSize = Math.floor(children.length / colCount);
    const extra    = children.length % colCount;
    const sizes = Array.from({ length: colCount }, (_, c) => baseSize + (c < extra ? 1 : 0));
    const withKids = children.filter((n) => hasVisibleKids(n.id));
    const tips = withKids.slice(0, colCount);
    const rest = [...children.filter((n) => !hasVisibleKids(n.id)), ...withKids.slice(colCount)];
    const tipCols = new Set(tips.map((_, j) => Math.floor(((j + 0.5) * colCount) / tips.length)));
    let t = 0;
    let q = 0;
    return sizes.map((size, c) => {
      const col: OrgNode[] = [];
      const hasTip = tipCols.has(c);
      while (col.length < size - (hasTip ? 1 : 0)) col.push(rest[q++]);
      if (hasTip) col.push(tips[t++]);
      return col;
    });
  }

  // Meio-ângulo mínimo de UMA coluna: a largura de um rótulo no raio onde o
  // anel em coluna começa (stepOfRing), ou a soma do que os nós com
  // subordinados dessa coluna exigem pro próximo nível (normalmente só a
  // ponta — ver columnsFor), o que for maior. Sem angScale: o piso de coluna
  // já é o mínimo físico (rótulo + respiro curto), não tem folga pra encolher.
  function columnHalf(col: OrgNode[], colRing: number): number {
    const floor = (stepOfRing.get(colRing) ?? MIN_COL_ANG) / 2;
    const demand = col.filter((n) => hasVisibleKids(n.id)).reduce((s, n) => s + requiredHalf(n.id), 0);
    return Math.max(floor, demand);
  }

  // Empacota um grupo inteiro de irmãos (mesmo pai) centrado no ângulo do
  // pai, com a largura de cada irmão igual ao que ele exige de verdade
  // (requiredHalf) — cumulativo, então nunca há sobreposição entre irmãos
  // por construção. Na maioria dos anéis `avail` já bate exatamente com a
  // soma dos pisos (requiredHalf do pai é a soma recursiva do que os filhos
  // exigem), mas isso não é garantido quando o PAI foi posicionado em modo
  // coluna — lá o `half` que ele recebe vem de um ângulo fixo entre colunas,
  // sem relação com requiredHalf. Por isso o piso de cada filho nunca é
  // comprimido abaixo de si mesmo — o grupo transborda o orçamento herdado
  // antes de sobrepor um irmão ao outro; só a sobra (`2*avail` menos a soma
  // dos pisos, quando houver) é distribuída proporcionalmente por cima.
  // Retorna {node, angle, half} — `half` é repassado como o `avail` do
  // próprio filho quando ele por sua vez vira pai no anel seguinte.
  function packGroup(
    grp: OrgNode[],
    parentAngle: number,
    avail: number,
  ): Array<{ node: OrgNode; angle: number; half: number }> {
    if (grp.length === 0) return [];
    // Piso de cada filho = seu requiredHalf (nunca comprimido abaixo disso —
    // ver comentário de requiredHalf). Normalmente `avail` já é exatamente a
    // soma dos pisos (o pai herdou o valor certo), mas há uma exceção real:
    // quando o ANEL DO PAI caiu em modo coluna, o `half` que ele recebeu não
    // vem de requiredHalf — vem de um ângulo fixo entre colunas (colAngStep),
    // sem relação nenhuma com o quanto os filhos realmente precisam. Nesse
    // caso `avail` pode ser bem menor que a soma dos pisos, e sem essa trava
    // o `extra` negativo comprimiria os filhos abaixo do piso físico de novo.
    const floors = grp.map((n) => 2 * requiredHalf(n.id));
    const totalFloor = floors.reduce((s, f) => s + f, 0);
    const extra = Math.max(0, 2 * avail - totalFloor);
    const widths = floors.map((f) => f + (f / totalFloor) * extra);
    const fullSpan = widths.reduce((s, w) => s + w, 0);
    let cursor = -fullSpan / 2;
    return grp.map((node, i) => {
      const w = widths[i];
      const center = cursor + w / 2;
      cursor += w;
      return { node, angle: parentAngle + center, half: w / 2 };
    });
  }

  // ── Compressed effective-level→ring mapping ──
  // `effLevel` combina profundidade real na árvore com o campo `level` bruto:
  // effLevel(filho) = max(level bruto do filho, effLevel(pai) + 1).
  // Isso corrige dois problemas de dado ao mesmo tempo:
  //  • level não incrementado de pai pra filho — o piso `effLevel(pai)+1`
  //    garante que o filho nunca cai no mesmo anel do pai, mesmo com level
  //    igual ou menor no cadastro. Motivo histórico (2026-09): a view do
  //    banco cortava nível 12 (Aprendiz) pra 11, o mesmo nível do próprio
  //    superior (Auxiliar/Estagiário) — corrigido na causa raiz pelo
  //    contrato em docs/organograma-hierarquia-schema.md. O piso continua
  //    aqui como rede de segurança (não faz nada quando o dado já vem
  //    certo), não é mais o motivo real de ninguém cair no mesmo anel do pai.
  //  • irmãos "achatados" direto no setor com levels bem diferentes (ex.:
  //    Gerente de Marketing nível 5 e Auxiliar de Marketing nível 11, ambos
  //    com parentId = setor, sem relação de pai/filho entre si) — usar só a
  //    profundidade da árvore os empilharia no mesmo anel; usar o level
  //    bruto como base preserva a diferença de hierarquia entre eles.
  const effLevelOf = new Map<string, number>([[sectorId, 0]]);
  function collectEffLevels(id: string) {
    const parentEff = effLevelOf.get(id) ?? 0;
    for (const c of childrenOf.get(id) ?? []) {
      if (hiddenIds.has(c.id)) continue;
      effLevelOf.set(c.id, Math.max(c.level, parentEff + 1));
      collectEffLevels(c.id);
    }
  }
  collectEffLevels(sectorId);

  const presentLevels = new Set<number>();
  function collectLevels(id: string) {
    for (const c of childrenOf.get(id) ?? []) {
      if (hiddenIds.has(c.id)) continue;
      if (!c.isSector) presentLevels.add(effLevelOf.get(c.id)!);
      collectLevels(c.id);
    }
  }
  collectLevels(sectorId);
  const levelToRing = new Map(
    [...presentLevels].sort((a, b) => a - b).map((lvl, i) => {
      // When subSectorRing is reserved for isSector nodes, bump employee rings that
      // would collide with it so they land in a higher ring instead.
      let ring = i + 1;
      if (subSectorRing != null && ring >= subSectorRing) ring += 1;
      return [lvl, ring];
    }),
  );
  const getRing = (n: OrgNode) => n.isSector ? (subSectorRing ?? 1) : (levelToRing.get(effLevelOf.get(n.id) ?? 0) ?? 1);

  // ── Collect visible nodes per ring in DFS order ──
  const ringCollect = new Map<number, OrgNode[]>();
  function dfs(id: string) {
    for (const child of childrenOf.get(id) ?? []) {
      if (hiddenIds.has(child.id)) continue;
      const ring = getRing(child);
      if (!ringCollect.has(ring)) ringCollect.set(ring, []);
      ringCollect.get(ring)!.push(child);
      dfs(child.id);
    }
  }
  dfs(sectorId);

  // Raio mínimo p/ os nós de um anel caberem em volta da circunferência sem sobrepor.
  const ringMinR = (ringNodes: OrgNode[]): number => {
    const maxVR = Math.max(...ringNodes.map((n) => spacingR(n)));
    const footprint = Math.max(2 * maxVR, LABEL_FOOTPRINT_PX);
    return (ringNodes.length * (footprint + MIN_GAP)) / PI2;
  };
  // Um anel "cabe em volta" se esse raio ≤ MAX_RING_R. Acima disso (40k) → modo coluna.
  const fitsAround = (ringNodes: OrgNode[]): boolean => ringMinR(ringNodes) <= MAX_RING_R;

  const totalVisible  = [...ringCollect.values()].reduce((s, a) => s + a.length, 0);

  // Escala o espaçamento proporcionalmente ao tamanho do setor:
  // sqrt(n / LARGE_SECTOR) cresce suavemente — setores pequenos ficam compactos,
  // setores grandes ganham fôlego sem saltos bruscos.
  const spacingScale    = Math.max(1.0, Math.sqrt(totalVisible / LARGE_SECTOR));
  const MIN_GAP         = MIN_GAP_BASE * spacingScale;
  const RING_STEP       = RING_STEP_BASE * spacingScale;

  // ── Dynamic ring radius ──
  // Em modo esparso (poucos nós por anel) os anéis são empilhados de forma COMPACTA:
  // cada anel nasce um passo fixo (RING_STEP) depois do anterior, em vez de usar os
  // raios estáticos grandes (150, 300, 475…) que deixam vãos enormes quando há pouca
  // gente. Quando um anel tem muitos nós, o raio cresce o suficiente para todos
  // caberem em volta (minR) — preservando o comportamento de setores grandes. O passo
  // é o mesmo entre qualquer par de anéis vizinhos — não soma o raio visual do nó
  // (que encolhe a cada nível, ver SECTOR_NODE_RADIUS), senão o espaçamento
  // aparente varia dependendo de quais níveis são vizinhos.
  const dynamicRingR = new Map<number, number>();
  const centerVR = (nodeRadii[0] ?? 52) + SECTOR_CARD_DECOR_PAD; // o próprio setor é sempre um SectorCard
  let prevR = centerVR;  // raio do anel anterior (começa no raio do card central)
  [...ringCollect.keys()].sort((a, b) => a - b).forEach((ring) => {
    const ringNodes = ringCollect.get(ring)!;
    if (fitsAround(ringNodes)) {
      const minR  = ringMinR(ringNodes);   // raio p/ caber em volta
      const stepR = prevR + RING_STEP;     // passo fixo a partir do anel anterior
      const r = Math.max(minR, stepR);
      dynamicRingR.set(ring, r);
      prevR = r;
    } else {
      // Column mode — radius is computed per-parent at placement time
      const staticR = ringRadii[ring] ?? (ring * 200);
      dynamicRingR.set(ring, staticR);
      prevR = staticR; // o outer real é recalculado no placement (outerRByRing)
    }
  });

  // ── Raio ESTIMADO onde cada anel começa ──
  // dynamicRingR usa o raio estático pra anéis em coluna (o real só é
  // conhecido no posicionamento) e, por consequência, subestima todos os anéis
  // depois de uma coluna. Pro cálculo de ângulo (stepOfRing) isso importa: o
  // mesmo rótulo de 130px ocupa bem menos ângulo a 1100px do que a 665px.
  // Aqui a cadeia é refeita com a mesma regra do posicionamento — coluna
  // nasce RING_STEP depois do anterior e cresce (linhas - 1) × rowStep; anel
  // depois de coluna nasce uma linha depois da coluna mais funda (ver
  // clearOfColumns); anel depois de anel = dynamicRingR, igual a antes.
  const estRingR = new Map<number, number>();
  {
    let estOuter = centerVR;
    let prevWasColumn = false;
    let prevRowStep = COL_ROW_PX;
    let prevCount = 1;
    [...ringCollect.keys()].sort((a, b) => a - b).forEach((ring) => {
      const ringNodes = ringCollect.get(ring)!;
      const isColumn = !fitsAround(ringNodes) || ringNodes.length > RING_GROUP_THRESHOLD;
      const maxVR = Math.max(...ringNodes.map((n) => visualR(n)));
      const rowStep = Math.max(COL_ROW_PX, 2 * maxVR + LABEL_HEIGHT_PX);
      if (isColumn) {
        const base = estOuter + RING_STEP;
        const perParent = new Map<string, number>();
        ringNodes.forEach((n) => {
          const key = n.parentId && n.parentId !== sectorId ? n.parentId : sectorId;
          perParent.set(key, (perParent.get(key) ?? 0) + 1);
        });
        const flat = perParent.get(sectorId) ?? 0;
        perParent.delete(sectorId);
        const maxGroup = Math.max(Math.ceil(flat / prevCount), ...perParent.values());
        const rows = Math.ceil(maxGroup / COL_COUNT);
        estRingR.set(ring, base);
        estOuter = base + (rows - 1) * rowStep + maxVR;
      } else {
        const dyn = dynamicRingR.get(ring)!;
        const r = prevWasColumn ? Math.max(dyn, estOuter - maxVR + prevRowStep) : dyn;
        estRingR.set(ring, r);
        estOuter = r;
      }
      prevWasColumn = isColumn;
      prevRowStep = rowStep;
      prevCount = ringNodes.length;
    });
  }

  // ── Passo angular de cada anel (piso físico por nó) ──
  // Mesma fórmula usada no posicionamento em modo anel (mais abaixo), mas
  // calculada aqui pra TODOS os anéis de antemão — só depende da contagem/
  // tamanho de cada anel, não de nada decidido durante o posicionamento em
  // si. Usado por requiredHalf() pra saber quanto espaço um nó exige de
  // verdade, de baixo pra cima, antes de repartir os pais. Em anel em coluna,
  // o passo é a largura de UMA coluna (rótulo + respiro curto) — colunas são
  // densas de propósito, sem a folga generosa (RING_ANG_GAP) do modo anel.
  const stepOfRing = new Map<number, number>();
  const ringIsColumn = new Map<number, boolean>();
  [...ringCollect.keys()].forEach((ring) => {
    const ringNodes = ringCollect.get(ring)!;
    const isColumn = !fitsAround(ringNodes) || ringNodes.length > RING_GROUP_THRESHOLD;
    ringIsColumn.set(ring, isColumn);
    const r = estRingR.get(ring)!;
    if (isColumn) {
      stepOfRing.set(ring, (LABEL_FOOTPRINT_PX + COL_LABEL_GAP) / r);
      return;
    }
    const maxVR = Math.max(...ringNodes.map((n) => spacingR(n)));
    const footprint = Math.max(2 * maxVR, LABEL_FOOTPRINT_PX);
    const tightStep = (footprint + RING_ANG_GAP) / r;
    const evenStep = PI2 / ringNodes.length;
    // Sempre o piso FÍSICO (passo justo), nunca a volta dividida igualmente:
    // em setor grande, usar 2π/n como piso fazia um anel com pouca gente
    // pedir uma fatia enorme por pessoa (caso: setor de teste, 6 auxiliares
    // sob um único assistente → 60° cada, o leque dele ocupava a volta
    // inteira e as linhas atravessavam o mapa). O espalhamento pela
    // circunferência em setor grande continua acontecendo — vem da SOBRA
    // que packGroup distribui proporcionalmente a partir do 1º anel.
    stepOfRing.set(ring, Math.min(evenStep, tightStep));
  });

  // ── Encolhe pra caber na volta ──
  // Os pisos de stepOfRing incluem uma folga generosa (RING_ANG_GAP) além do
  // rótulo. Quando a soma do que o 1º anel exige passa de uma volta inteira
  // (2·π de meio-orçamento… isto é, requiredHalf somado > π), packGroup
  // transborda e o excesso dá a volta por cima do começo do círculo — os dois
  // extremos se sobrepõem na "emenda" (caso real: Expedição, ramo do
  // Reinaldo com 5 auxiliares lá fora pedindo 84° → total de 419°, Felipe M.
  // em cima do Sebastião). Como requiredHalf é aditivo, escalar TODOS os
  // pisos pelo mesmo fator faz a soma caber exatamente na volta, sem
  // distorcer a proporção entre ramos. Nunca abaixo do mínimo físico
  // (rótulo + MIN_GAP, sem a folga extra) — aí não tem o que encolher.
  // Colunas já estão no mínimo físico (ver columnHalf) e não encolhem; o que
  // dá pra fazer com elas é EMPILHAR mais fundo (minRows) — menos colunas,
  // menos ângulo. Então, pra cada minRows a partir de 1 (padrão), busca
  // binária pelo maior fator dos pisos de anel que cabe na volta; o primeiro
  // minRows que cabe vence. Ou seja: primeiro gasta a folga dos anéis, só
  // depois aprofunda as colunas (caso: setor de teste, 22 colunas de uma
  // pessoa só no 3º anel + leques fundos → 437°, não cabia nem com a folga
  // toda gasta). Se nada couber, fica no mais compacto possível.
  {
    const firstRing = Math.min(...ringCollect.keys());
    const top = (ringCollect.get(firstRing) ?? []).filter((n) => n.parentId === sectorId || n.isSector);
    const totalAt = (scale: number, rows: number): number => {
      angScale = scale;
      minRows = rows;
      requiredHalfCache.clear();
      return top.reduce((sum, n) => sum + requiredHalf(n.id), 0);
    };
    const minScale = (LABEL_FOOTPRINT_PX + MIN_GAP) / (LABEL_FOOTPRINT_PX + RING_ANG_GAP);
    const MAX_MIN_ROWS = 6;
    for (let rows = 1; rows <= MAX_MIN_ROWS; rows++) {
      if (totalAt(1, rows) <= Math.PI) break;
      if (totalAt(minScale, rows) > Math.PI) continue; // ainda não cabe → empilha mais
      let lo = minScale;
      let hi = 1;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (totalAt(mid, rows) <= Math.PI) lo = mid; else hi = mid;
      }
      totalAt(lo, rows);
      break;
    }
  }

  const result: PositionedNode[] = [];
  const angleOf = new Map<string, number>();
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));
  debugWedges.length = 0;

  // ── Sector at center ──
  const sectorNode = nodes.find((n) => n.id === sectorId);
  if (sectorNode) {
    result.push({ ...sectorNode, parentId: null, x: 0, y: 0, angle: 0, radius: visualR(sectorNode) });
  }
  angleOf.set(sectorId, 0);

  // Ring-1 people — used to infer effective parent angle for flat-hierarchy nodes
  const ring1People: { level: number; angle: number }[] = [];

  const effectiveAngle = (node: OrgNode): number => {
    if (node.parentId !== sectorId) return angleOf.get(node.parentId!) ?? START;
    if (ring1People.length > 0) {
      const cands = ring1People.filter((p) => p.level <= node.level);
      return cands.length > 0
        ? cands.reduce((b, p) => (p.level > b.level ? p : b)).angle
        : ring1People.reduce((b, p) => (p.level < b.level ? p : b)).angle;
    }
    return START;
  };

  // placedByRing: ring-mode → all nodes; column-mode → column tip nodes only
  // (tips = deepest node in each column, becomes parent for the next ring).
  // `half` = orçamento angular reservado para aquele nó quando ele vira pai
  // do anel seguinte (ver packGroup).
  const placedByRing = new Map<number, Array<{ id: string; angle: number; half: number }>>();
  // Outermost radius actually placed in each ring (including column depth)
  const outerRByRing = new Map<number, number>();
  // Caixas (círculo + rótulo) dos nós posicionados em modo coluna, por anel —
  // o anel seguinte (modo anel) usa isso pra não nascer em cima de uma linha
  // da coluna (ver clearOfColumns).
  const colNodesByRing = new Map<number, Box[][]>();
  // Nó em modo coluna → ponta da coluna dele. Filhos de um nó do MEIO da
  // coluna (só acontece quando há mais nós com subordinados do que colunas,
  // ver columnsFor) se ancoram na ponta — é ela que vira "pai" no próximo
  // anel —, mas a linha continua saindo do chefe real.
  const anchorOf = new Map<string, string>();

  // ── Place each ring ──
  const norm = (θ: number) => ((θ - START + PI2 * 2) % PI2);

  [...ringCollect.keys()].sort((a, b) => a - b).forEach((ring) => {
    const ringNodes  = ringCollect.get(ring)!;
    // Ring 1 não tem anel anterior — quando precisa agrupar em colunas, usa o
    // próprio card do setor como "pai" único, abrindo um leque de 360°.
    const prevPlacedRaw = placedByRing.get(ring - 1) ?? [];
    let prevPlaced: Array<{ id: string; angle: number; half: number }>;
    if (ring === 1 && prevPlacedRaw.length === 0) {
      prevPlaced = [{ id: sectorId, angle: START, half: Math.PI }];
    } else if (prevPlacedRaw.length === 0) {
      // Ring gap (e.g. subSectorRing skips a ring) — walk back to find nearest non-empty ring
      let found: Array<{ id: string; angle: number; half: number }> = [];
      for (let r = ring - 1; r >= 1; r--) {
        const p = placedByRing.get(r);
        if (p && p.length > 0) { found = p; break; }
      }
      prevPlaced = found.length > 0 ? found : [{ id: sectorId, angle: START, half: Math.PI }];
    } else {
      prevPlaced = prevPlacedRaw;
    }
    const prevOuterR = ring === 1
      ? centerVR
      : (outerRByRing.get(ring - 1) ?? dynamicRingR.get(ring - 1) ?? 0);
    // Agrupa em colunas se o anel não cabe em volta (raio estouraria) OU se
    // simplesmente tem gente demais para um único anel ficar compacto — mesma
    // estratégia usada para setores grandes, já a partir do nível 1.
    const useColumns =
      (!fitsAround(ringNodes) || ringNodes.length > RING_GROUP_THRESHOLD) &&
      prevPlaced.length > 0;

    const ringPlaced: Array<{ id: string; angle: number; half: number }> = [];

    if (!useColumns) {
      // ────────────── RING MODE ──────────────
      // dynamicRingR foi calculado antes do posicionamento — quando o anel
      // anterior caiu em modo coluna, ele só conhece o raio estático daquele
      // anel, não a profundidade real das colunas (que crescem pra fora, linha
      // por linha), e o anel nasce em cima de uma linha da coluna (caso real:
      // Vendas, 18 vendedores em colunas de 3 → assistente Karol P. colada no
      // próprio chefe Joares S., na ponta da coluna). Então, depois de uma
      // coluna, o raio do anel é o menor que deixa TODOS os nós dele livres
      // das colunas — testando as caixas reais (círculo + rótulo, ver
      // boxesOf), então a folga é a mesma de uma linha a mais da coluna, em
      // qualquer direção. O anel continua com raio único: ele é a "régua"
      // visual do nível. Depois de um anel normal, basta o passo fixo a
      // partir do raio dele.
      const prevCols = colNodesByRing.get(ring - 1) ?? [];
      const clearOfColumns = (node: OrgNode, angle: number, fromR: number): number => {
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const hits = (R: number) => {
          const mine = boxesOf(node, ux * R, uy * R);
          return prevCols.some((boxes) => collide(mine, boxes));
        };
        let R = fromR;
        while (R < fromR + MAX_RING_R && hits(R)) R += 2;
        return R;
      };
      let r = prevCols.length === 0
        ? Math.max(dynamicRingR.get(ring)!, ring === 1 ? 0 : prevOuterR + RING_STEP)
        : dynamicRingR.get(ring)!;

      // Agrupa por pai real (ou pelo pai mais próximo angularmente, para
      // hierarquias "achatadas" onde o nível intermediário foi comprimido).
      // Cada grupo é então empacotado (packGroup) dentro do orçamento
      // angular que o PRÓPRIO PAI recebeu quando foi posicionado no anel
      // anterior — não da distância até o vizinho. Como requiredHalf(pai) já
      // é a soma recursiva do que os filhos exigem de verdade, o que os
      // filhos pedem cabe exatamente no que o pai reservou, em qualquer anel
      // (inclusive o 1, que usa o círculo inteiro — meio-orçamento π —
      // reservado pelo card do setor).
      ringNodes.sort((a, b) => norm(effectiveAngle(a)) - norm(effectiveAngle(b)));
      const prevById = new Map(prevPlaced.map((p) => [p.id, p]));
      const nearestPrev = (angle: number) =>
        prevPlaced.reduce((best, c) => {
          const dc = Math.min(Math.abs(norm(c.angle) - norm(angle)), PI2 - Math.abs(norm(c.angle) - norm(angle)));
          const db = Math.min(Math.abs(norm(best.angle) - norm(angle)), PI2 - Math.abs(norm(best.angle) - norm(angle)));
          return dc < db ? c : best;
        });
      const groupOrder: string[] = [];
      const groups = new Map<string, { parent: { id: string; angle: number; half: number }; nodes: OrgNode[] }>();
      ringNodes.forEach((node) => {
        const parent =
          (node.parentId && (prevById.get(node.parentId) ?? prevById.get(anchorOf.get(node.parentId) ?? ''))) ||
          nearestPrev(effectiveAngle(node));
        if (!groups.has(parent.id)) { groups.set(parent.id, { parent, nodes: [] }); groupOrder.push(parent.id); }
        groups.get(parent.id)!.nodes.push(node);
      });

      const nodeAngles: Array<{ node: OrgNode; angle: number; half: number }> = [];
      groupOrder.forEach((pid) => {
        const { parent, nodes: grp } = groups.get(pid)!;
        packGroup(grp, parent.angle, parent.half).forEach((p) => nodeAngles.push(p));
      });

      nodeAngles.forEach(({ node, angle, half }) => {
        let visualParentId = node.parentId;
        if (ring > 1 && node.parentId === sectorId && prevPlaced.length > 0) {
          const myN = norm(angle);
          visualParentId = prevPlaced.reduce((best, c) => {
            const dc = Math.min(Math.abs(norm(c.angle) - myN), PI2 - Math.abs(norm(c.angle) - myN));
            const db = Math.min(Math.abs(norm(best.angle) - myN), PI2 - Math.abs(norm(best.angle) - myN));
            return dc < db ? c : best;
          }).id;
        }
        const vr = visualR(node);
        result.push({ ...node, parentId: visualParentId, x: 0, y: 0, angle, radius: vr });
        angleOf.set(node.id, angle);
        ringPlaced.push({ id: node.id, angle, half });
        if (ring === 1 && !node.isSector) ring1People.push({ level: node.level, angle });
      });

      // Raio único do anel: o mais externo que algum nó exigiu (ver acima).
      const ringStart = result.length - nodeAngles.length;
      if (prevCols.length > 0) {
        // Repete até estabilizar: crescer o raio por causa de um nó pode
        // levar outro nó (que antes cabia antes da coluna dele) pra dentro dela.
        for (let changed = true, guard = 0; changed && guard <= prevCols.length; guard++) {
          changed = false;
          nodeAngles.forEach(({ node, angle }) => {
            const need = clearOfColumns(node, angle, r);
            if (need > r) { r = need; changed = true; }
          });
        }
      }
      for (let i = ringStart; i < result.length; i++) {
        const p = result[i];
        result[i] = { ...p, x: Math.cos(p.angle) * r, y: Math.sin(p.angle) * r };
      }
      dynamicRingR.set(ring, r);
      outerRByRing.set(ring, r);

    } else {
      // ────────────── COLUMN MODE ──────────────
      // Children are arranged in radial columns that extend outward from each
      // parent. Columns are centered on the parent's angle. The angle step
      // between adjacent columns adapts to the arc available per parent so
      // columns from different parents never overlap each other.
      // Mesmo passo fixo do modo anel (RING_STEP) — senão a transição
      // ring-mode→column-mode (ex.: nível com >RING_GROUP_THRESHOLD pessoas)
      // fica com um espaçamento diferente de qualquer outro par de anéis.
      const baseR = prevOuterR + RING_STEP;

      const sortedParents = [...prevPlaced].sort((a, b) => norm(a.angle) - norm(b.angle));
      const M = sortedParents.length;
      const K = ringNodes.length;

      // Assign children to parents
      const childrenByParent = new Map<string, OrgNode[]>();
      sortedParents.forEach((p) => childrenByParent.set(p.id, []));

      ringNodes.forEach((node, i) => {
        const pid = node.parentId;
        const anchor = pid && pid !== sectorId
          ? (childrenByParent.has(pid) ? pid : anchorOf.get(pid))
          : undefined;
        if (anchor && childrenByParent.has(anchor)) {
          childrenByParent.get(anchor)!.push(node);
        } else {
          // Flat hierarchy: proportional assignment to sorted parents
          const pIdx = Math.min(Math.floor((i * M) / K), M - 1);
          childrenByParent.get(sortedParents[pIdx].id)!.push(node);
        }
      });

      let localMaxR = baseR;

      sortedParents.forEach(({ id: parentId, angle: parentAngle, half: parentHalf }) => {
        const children = childrenByParent.get(parentId) ?? [];
        if (children.length === 0) return;

        const columns  = columnsFor(children);
        const colCount = columns.length;

        // Meio-espaço de cada coluna: o piso dela (columnHalf — rótulo, ou o
        // que os subordinados da ponta exigem) e, se o pai reservou mais do que
        // a soma dos pisos, a sobra dividida igualmente. Com um único "pai"
        // (ex.: ring 1 saindo direto do card do setor) não há vizinho
        // disputando ângulo — a sobra é usada inteira, espalhando as colunas
        // pelo círculo. Com vários pais, cada coluna cresce no máximo até
        // MAX_COL_ANG: leque compacto, sem colunas soltas no meio do vazio.
        // Empacotadas com cursor cumulativo (igual packGroup no modo anel):
        // só a coluna que precisa de mais espaço fica mais afastada da vizinha.
        const floors = columns.map((col) => columnHalf(col, ring));
        const floorSum = floors.reduce((s, f) => s + f, 0);
        const spare = Math.max(0, parentHalf - floorSum) / colCount;
        const colHalves = floors.map((f) =>
          M === 1 ? f + spare : f + Math.min(spare, Math.max(0, MAX_COL_ANG / 2 - f)),
        );
        const colFullSpan = colHalves.reduce((s, h) => s + 2 * h, 0);
        let colCursor = -colFullSpan / 2;
        const colCenters: number[] = colHalves.map((h) => {
          const center = colCursor + h;
          colCursor += 2 * h;
          return center;
        });

        // Espaço radial entre linhas precisa caber o diâmetro do nó + o rótulo
        // (nome + cargo) abaixo dele — caso contrário o rótulo de uma linha
        // invade o próximo nó da coluna. Esse é o piso (vale na vertical);
        // cada coluna cresce a partir dele conforme a direção (rowStepAlong).
        const maxChildVR = Math.max(...children.map((n) => visualR(n)));
        const rowStepFloor = Math.max(COL_ROW_PX, 2 * maxChildVR + LABEL_HEIGHT_PX);

        columns.forEach((col, c) => {
          const colAngle = parentAngle + colCenters[c];
          const tipId = col[col.length - 1].id;
          const rowStep = rowStepAlong(col, colAngle, rowStepFloor);
          // Chefe de cada nó: o REAL quando ele já está no mapa (pode ser um
          // nó do meio de uma coluna, não a ponta onde este grupo se ancorou);
          // hierarquia achatada (pai = setor) liga no pai visual.
          const bossOf = (node: OrgNode) =>
            node.parentId && node.parentId !== sectorId && angleOf.has(node.parentId) ? node.parentId : parentId;
          const groupBoss = bossOf(col[0]);
          col.forEach((node, row) => {
            const nodeR = baseR + row * rowStep;
            // Todo mundo aponta pro próprio chefe. Antes, cada linha da coluna
            // ligava na anterior (Gabriel → Hugo → Joares), o que parecia uma
            // cadeia de chefia entre colegas. Agora, numa coluna com 2+ colegas
            // do mesmo chefe, o desenho envolve a coluna numa cápsula e só a
            // 1ª linha ganha traço até o chefe (calculateConnections pula as
            // demais — ver columnRow). Quem tem chefe diferente do grupo (caso
            // raro de âncora, ver anchorOf) fica fora da cápsula, com traço próprio.
            const boss = bossOf(node);
            const inCapsule = col.length > 1 && boss === groupBoss;

            const vr = visualR(node);
            result.push({
              ...node,
              parentId: boss,
              x: Math.cos(colAngle) * nodeR,
              y: Math.sin(colAngle) * nodeR,
              angle: colAngle,
              radius: vr,
              ...(inCapsule ? { columnGroupId: `col-${tipId}`, columnRow: row } : {}),
            });
            angleOf.set(node.id, colAngle);
            anchorOf.set(node.id, tipId);
            localMaxR = Math.max(localMaxR, nodeR + vr);
            if (!colNodesByRing.has(ring)) colNodesByRing.set(ring, []);
            colNodesByRing.get(ring)!.push(boxesOf(node, Math.cos(colAngle) * nodeR, Math.sin(colAngle) * nodeR));
          });
          // A ponta (nó mais externo da coluna) vira pai do próximo anel.
          ringPlaced.push({ id: tipId, angle: colAngle, half: colHalves[c] });
        });
      });

      outerRByRing.set(ring, localMaxR);
    }

    const innerR = dynamicRingR.get(ring)!;
    const outerR = dynamicRingR.get(ring + 1) ?? innerR + RING_STEP;
    ringPlaced.forEach(({ id, angle, half }) => {
      debugWedges.push({ id, name: nameById.get(id) ?? id, angle, half, innerR, outerR });
    });

    placedByRing.set(ring, ringPlaced);
  });

  return result;
}

// ── Connections ────────────────────────────────────────────────────────
export function calculateConnections(positions: PositionedNode[]): Connection[] {
  const posMap = new Map(positions.map((p) => [p.id, p]));
  const connections: Connection[] = [];

  positions.forEach((node) => {
    if (!node.parentId) return;
    // Colegas empilhados numa coluna (2ª linha em diante) não ganham traço
    // próprio: a cápsula da coluna + o traço do chefe até a 1ª linha já
    // dizem quem é o chefe (ver calculateEvenSectorLayout, modo coluna).
    if (node.columnRow !== undefined && node.columnRow > 0) return;
    const parent = posMap.get(node.parentId);
    if (!parent) return;
    const dx = node.x - parent.x;
    const dy = node.y - parent.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    connections.push({
      fromId: parent.id,
      toId: node.id,
      fromX: parent.x + nx * parent.radius,
      fromY: parent.y + ny * parent.radius,
      toX: node.x - nx * node.radius,
      toY: node.y - ny * node.radius,
      level: node.level,
    });
  });

  return connections;
}
