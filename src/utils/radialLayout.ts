import { OrgNode, PositionedNode, Connection } from '@/types/orgChart';

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
  const RING_ANG_GAP = 60;  // folga angular entre nós vizinhos em anéis esparsos (mais "disposto")
  // Rótulo (nome + cargo) abaixo do círculo é bem mais largo que o próprio círculo;
  // usar só o diâmetro do nó para espaçamento faz labels vizinhos se sobreporem em
  // anéis com muita gente. Estimativa de largura do rótulo renderizado.
  const LABEL_FOOTPRINT_PX = 100;
  const RADIAL_GAP_BASE   = 50;  // folga radial base entre anéis (scaled dynamically)
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
  const COL_GAP_PX   = 80;  // gap between innermost column row and parent ring
  const MIN_COL_ANG  = (6  * Math.PI) / 180; // minimum 6° between columns
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
  // aqui, o RADIAL_GAP calculado é comido pelos próprios anéis decorativos e
  // o card parece colado no vizinho mesmo com folga "correta" no papel. Só
  // usado nos cálculos de espaçamento; o raio REALMENTE renderizado
  // (visualR, abaixo) continua o mesmo — isso não infla o card, só o respiro
  // ao redor dele.
  const SECTOR_CARD_DECOR_PAD = 10;
  const spacingR = (node: OrgNode): number =>
    visualR(node) + (node.id === sectorId || node.isSector ? SECTOR_CARD_DECOR_PAD : 0);

  // ── Build full children map ──
  const childrenOf = new Map<string, OrgNode[]>();
  nodes.forEach((n) => {
    if (!n.parentId) return;
    if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
    childrenOf.get(n.parentId)!.push(n);
  });

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

  // ── Recursive subtree weight ──
  // Peso = total de folhas visíveis na subárvore inteira de um nó (todos os
  // anéis abaixo dele, não só os filhos diretos). Usado para dividir o
  // espaço angular proporcionalmente ao tamanho REAL de cada ramo — sem
  // isso, dois líderes com leques de tamanhos bem diferentes recebem a
  // mesma largura, o maior fica espremido contra o vizinho e o menor sobra
  // espaço vazio do lado oposto (sintoma reportado na Expedição).
  const leafWeightCache = new Map<string, number>();
  function leafWeight(id: string): number {
    const cached = leafWeightCache.get(id);
    if (cached !== undefined) return cached;
    const kids = (childrenOf.get(id) ?? []).filter((c) => !hiddenIds.has(c.id));
    const w = kids.length === 0 ? 1 : kids.reduce((s, k) => s + leafWeight(k.id), 0);
    leafWeightCache.set(id, w);
    return w;
  }

  // Empacota um grupo inteiro de irmãos (mesmo pai) centrado no ângulo do
  // pai, com a largura de cada irmão proporcional ao seu leafWeight —
  // cumulativo, então nunca há sobreposição entre irmãos por construção.
  // `avail` é o MEIO-orçamento reservado do próprio pai (herdado de quando
  // o pai foi posicionado, não a distância até o vizinho): como o peso do
  // pai já é a soma recursiva do peso de todos os filhos, a largura total
  // pedida pelos filhos bate exatamente com o que o pai reservou — por
  // isso o leque cabe sem precisar comprimir depois, em qualquer anel.
  // Retorna {node, angle, half} — `half` é repassado como o `avail` do
  // próprio filho quando ele por sua vez vira pai no anel seguinte.
  function packGroup(
    grp: OrgNode[],
    parentAngle: number,
    avail: number,
    minHalf: number,
  ): Array<{ node: OrgNode; angle: number; half: number }> {
    if (grp.length === 0) return [];
    const weights = grp.map((n) => leafWeight(n.id));
    const totalW = weights.reduce((s, w) => s + w, 0) || 1;
    const rawWidths = weights.map((w) => Math.max(2 * minHalf, (w / totalW) * (2 * avail)));
    const span = rawWidths.reduce((s, w) => s + w, 0);
    const scale = avail > 0 && span > 2 * avail ? (2 * avail) / span : 1;
    const widths = rawWidths.map((w) => w * scale);
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

  // Setor grande → espalha pela volta inteira (passo uniforme) em vez de agrupar no topo.
  const totalVisible  = [...ringCollect.values()].reduce((s, a) => s + a.length, 0);
  const sectorIsLarge = totalVisible >= LARGE_SECTOR;

  // Escala o espaçamento proporcionalmente ao tamanho do setor:
  // sqrt(n / LARGE_SECTOR) cresce suavemente — setores pequenos ficam compactos,
  // setores grandes ganham fôlego sem saltos bruscos.
  const spacingScale    = Math.max(1.0, Math.sqrt(totalVisible / LARGE_SECTOR));
  const MIN_GAP         = MIN_GAP_BASE * spacingScale;
  const RADIAL_GAP      = RADIAL_GAP_BASE * spacingScale;

  // ── Dynamic ring radius ──
  // Em modo esparso (poucos nós por anel) os anéis são empilhados de forma COMPACTA:
  // cada anel nasce logo após a borda do anterior (RADIAL_GAP), em vez de usar os
  // raios estáticos grandes (150, 300, 475…) que deixam vãos enormes quando há pouca
  // gente. Quando um anel tem muitos nós, o raio cresce o suficiente para todos
  // caberem em volta (minR) — preservando o comportamento de setores grandes.
  const dynamicRingR = new Map<number, number>();
  const centerVR = (nodeRadii[0] ?? 52) + SECTOR_CARD_DECOR_PAD; // o próprio setor é sempre um SectorCard
  let prevOuter  = centerVR;  // borda externa do anel anterior (começa no card central)
  [...ringCollect.keys()].sort((a, b) => a - b).forEach((ring) => {
    const ringNodes = ringCollect.get(ring)!;
    const maxVR = Math.max(...ringNodes.map((n) => spacingR(n)));
    if (fitsAround(ringNodes)) {
      const minR     = ringMinR(ringNodes);              // raio p/ caber em volta
      const compactR = prevOuter + RADIAL_GAP + maxVR;   // colado ao anterior
      const r = Math.max(minR, compactR);
      dynamicRingR.set(ring, r);
      prevOuter = r + maxVR;
    } else {
      // Column mode — radius is computed per-parent at placement time
      const staticR = ringRadii[ring] ?? (ring * 200);
      dynamicRingR.set(ring, staticR);
      prevOuter = staticR; // o outer real é recalculado no placement (outerRByRing)
    }
  });

  const result: PositionedNode[] = [];
  const angleOf = new Map<string, number>();

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
      const r = dynamicRingR.get(ring)!;
      // Passo angular depende do TAMANHO do setor:
      //  • Setor grande → passo uniforme (2π/n): espalha os filhos pela volta inteira,
      //    preenchendo a circunferência (a hierarquia é mantida pelo effectiveAngle,
      //    que centra cada grupo de filhos no ângulo do pai).
      //  • Setor pequeno → passo justo (ombro a ombro): nós unidos e próximos, em
      //    sequência horária a partir do topo, sem grandes vãos.
      const maxVR     = Math.max(...ringNodes.map((n) => spacingR(n)));
      const footprint = Math.max(2 * maxVR, LABEL_FOOTPRINT_PX);
      const tightStep = (footprint + RING_ANG_GAP) / r;   // nós lado a lado, com folga p/ respirar (inclui rótulo)
      const evenStep  = PI2 / ringNodes.length;           // volta inteira dividida
      const step      = sectorIsLarge ? evenStep : Math.min(evenStep, tightStep);

      // Agrupa por pai real (ou pelo pai mais próximo angularmente, para
      // hierarquias "achatadas" onde o nível intermediário foi comprimido).
      // Cada grupo é então empacotado (packGroup) dentro do orçamento
      // angular que o PRÓPRIO PAI recebeu quando foi posicionado no anel
      // anterior — não da distância até o vizinho. Como o peso do pai já é
      // a soma recursiva do peso de todos os seus filhos, o que os filhos
      // pedem cabe exatamente no que o pai reservou, em qualquer anel
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
        const parent = (node.parentId && prevById.get(node.parentId)) || nearestPrev(effectiveAngle(node));
        if (!groups.has(parent.id)) { groups.set(parent.id, { parent, nodes: [] }); groupOrder.push(parent.id); }
        groups.get(parent.id)!.nodes.push(node);
      });

      const minHalf = step / 2;
      const nodeAngles: Array<{ node: OrgNode; angle: number; half: number }> = [];
      groupOrder.forEach((pid) => {
        const { parent, nodes: grp } = groups.get(pid)!;
        packGroup(grp, parent.angle, parent.half, minHalf).forEach((p) => nodeAngles.push(p));
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
        result.push({ ...node, parentId: visualParentId, x: Math.cos(angle) * r, y: Math.sin(angle) * r, angle, radius: vr });
        angleOf.set(node.id, angle);
        ringPlaced.push({ id: node.id, angle, half });
        if (ring === 1 && !node.isSector) ring1People.push({ level: node.level, angle });
      });

      outerRByRing.set(ring, r);

    } else {
      // ────────────── COLUMN MODE ──────────────
      // Children are arranged in radial columns that extend outward from each
      // parent. Columns are centered on the parent's angle. The angle step
      // between adjacent columns adapts to the arc available per parent so
      // columns from different parents never overlap each other.
      const baseR = prevOuterR + COL_GAP_PX;

      const sortedParents = [...prevPlaced].sort((a, b) => norm(a.angle) - norm(b.angle));
      const M = sortedParents.length;
      const K = ringNodes.length;

      // Assign children to parents
      const childrenByParent = new Map<string, OrgNode[]>();
      sortedParents.forEach((p) => childrenByParent.set(p.id, []));

      ringNodes.forEach((node, i) => {
        const pid = node.parentId;
        if (pid && pid !== sectorId && childrenByParent.has(pid)) {
          childrenByParent.get(pid)!.push(node);
        } else {
          // Flat hierarchy: proportional assignment to sorted parents
          const pIdx = Math.min(Math.floor((i * M) / K), M - 1);
          childrenByParent.get(sortedParents[pIdx].id)!.push(node);
        }
      });

      let localMaxR = baseR;

      sortedParents.forEach(({ id: parentId, angle: parentAngle }, pIdx) => {
        const children = childrenByParent.get(parentId) ?? [];
        if (children.length === 0) return;

        // Arc available for this parent's columns (half distance to each neighbour)
        const prevA = pIdx > 0 ? norm(sortedParents[pIdx - 1].angle) : norm(parentAngle) - PI2 / M;
        const nextA = pIdx < M - 1 ? norm(sortedParents[pIdx + 1].angle) : norm(parentAngle) + PI2 / M;
        const halfArc = Math.min(
          Math.abs(norm(parentAngle) - prevA) / 2,
          Math.abs(nextA - norm(parentAngle)) / 2,
        );

        const colCount = Math.max(1, Math.min(COL_COUNT, children.length));
        // Divide os filhos o mais igual possível entre as colunas (ex.: 23 em 7
        // colunas → 4/4/3/3/3/3/3). As primeiras `extra` colunas levam 1 a mais
        // que as demais.
        const baseSize = Math.floor(children.length / colCount);
        const extra    = children.length % colCount;
        const colOffsets: number[] = [];
        {
          let acc = 0;
          for (let c = 0; c < colCount; c++) {
            colOffsets.push(acc);
            acc += baseSize + (c < extra ? 1 : 0);
          }
        }
        const colOf = (i: number): number => {
          for (let c = colCount - 1; c >= 0; c--) {
            if (i >= colOffsets[c]) return c;
          }
          return 0;
        };

        // Com um único "pai" (ex.: ring 1 saindo direto do card do setor) não há
        // pai vizinho disputando ângulo — espalha as colunas pelo círculo inteiro
        // em vez de espremer tudo no leque estreito (6-14°) pensado p/ múltiplos pais.
        const colAngStep = colCount > 1
          ? (M === 1
              ? PI2 / colCount
              : Math.min(MAX_COL_ANG, Math.max(MIN_COL_ANG, (halfArc * 2 * 0.85) / (colCount - 1))))
          : 0;

        // colLast[col] = id of the last-placed node in that column (becomes next row's parent)
        const colLast = new Map<number, string>();

        // Espaço radial entre linhas precisa caber o diâmetro do nó + o rótulo
        // (nome + cargo) abaixo dele — caso contrário o rótulo de uma linha
        // invade o próximo nó da coluna.
        const maxChildVR = Math.max(...children.map((n) => visualR(n)));
        const rowStep = Math.max(COL_ROW_PX, 2 * maxChildVR + LABEL_HEIGHT_PX);

        children.forEach((node, i) => {
          const col = colOf(i);
          const row = i - colOffsets[col];

          const colAngle = parentAngle + (col - (colCount - 1) / 2) * colAngStep;
          const nodeR    = baseR + row * rowStep;

          // Row 0 connects to parent; subsequent rows connect to previous row
          const visualParentId = row === 0 ? parentId : (colLast.get(col) ?? parentId);

          const vr = visualR(node);
          result.push({
            ...node,
            parentId: visualParentId,
            x: Math.cos(colAngle) * nodeR,
            y: Math.sin(colAngle) * nodeR,
            angle: colAngle,
            radius: vr,
          });
          angleOf.set(node.id, colAngle);
          colLast.set(col, node.id);
          localMaxR = Math.max(localMaxR, nodeR + vr);
        });

        // Column tips (deepest node per column) become parents for the next ring
        colLast.forEach((tipId, col) => {
          const tipAngle = parentAngle + (col - (colCount - 1) / 2) * colAngStep;
          const tipHalf  = colAngStep > 0 ? colAngStep / 2 : halfArc;
          ringPlaced.push({ id: tipId, angle: tipAngle, half: tipHalf });
        });
      });

      outerRByRing.set(ring, localMaxR);
    }

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
