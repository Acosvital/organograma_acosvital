import { fetchAllPages } from '@/lib/apiClient';
import type { OrgNode } from '@/types/orgChart';

// Shape retornado pela view externa /vw_organograma_nodes
interface VwNode {
  id:                  string;
  name:                string;
  role:                string;
  level:               number;
  parent_id:           string | null;
  is_sector:           boolean;
  photo_url:           string | null;
  sector_color:        string | null;
  sector_director_of:  string | null;
  id_ent:              string | null;
}

// Setores que são apenas containers organizacionais e não devem aparecer como
// nós no organograma (seus filhos diretos sobem para o pai do setor oculto).
const HIDDEN_SECTOR_NAMES = new Set(['diretoria', 'gerencia geral']);

function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Setores importados via Supabase usam prefixo 'sec-'; a API externa usa o UUID
// puro. Normaliza para comparar com os ids crus de /setores (mesmo padrão
// defensivo usado em OrgChart.tsx/openSector).
function canonId(id: string): string {
  return id.startsWith('sec-') ? id.slice(4) : id;
}

interface FuncScope { id: string; id_setor: string; id_unidade: string }
interface SetorScope { id: string; parent_id: string | null }
interface UnitScope { funcUnitMap: Map<string, string>; visibleSectorIds: Set<string> }

// O drill-down lazy (?parent_id=) dispara um hop por nó durante o BFS de
// pré-carregamento — sem cache, cada hop refaria as duas buscas completas de
// /funcionarios e /setores. TTL 5 min aceita que estrutura organizacional muda poucas vezes/dia.
const scopeCache = new Map<string, { at: number; promise: Promise<UnitScope> }>();
const SCOPE_TTL_MS = 5 * 60 * 1000; // 5 min

/**
 * Calcula, para uma unidade, quais setores devem ficar visíveis e a qual
 * unidade cada funcionário pertence.
 * Um setor é visível se tiver ≥1 funcionário da unidade diretamente nele, OU
 * se algum de seus sub-setores for visível (propaga para cima na cadeia
 * parent_id de /setores).
 */
function computeUnitScope(unidadeId: string): Promise<UnitScope> {
  const cached = scopeCache.get(unidadeId);
  if (cached && Date.now() - cached.at < SCOPE_TTL_MS) return cached.promise;

  const promise = (async () => {
    const [funcionarios, setores] = await Promise.all([
      fetchAllPages<FuncScope>('/funcionarios', 'funcionarios'),
      fetchAllPages<SetorScope>('/setores', 'setores'),
    ]);

    const funcUnitMap  = new Map(funcionarios.map((f) => [f.id, f.id_unidade]));
    const setorParent  = new Map(setores.map((s) => [s.id, s.parent_id]));
    const directMatch  = new Set(
      funcionarios.filter((f) => f.id_unidade === unidadeId).map((f) => f.id_setor),
    );

    const visibleSectorIds = new Set<string>();
    for (const sectorId of directMatch) {
      let sid: string | null = sectorId;
      const seen = new Set<string>();
      while (sid && !seen.has(sid)) {
        seen.add(sid);
        visibleSectorIds.add(sid);
        sid = setorParent.get(sid) ?? null;
      }
    }

    return { funcUnitMap, visibleSectorIds };
  })();

  scopeCache.set(unidadeId, { at: Date.now(), promise });
  promise.catch(() => scopeCache.delete(unidadeId)); // não guarda falha em cache
  return promise;
}

function toOrgNode(n: VwNode): OrgNode {
  return {
    id:               n.id,
    name:             n.name          ?? '',
    role:             n.role          ?? '',
    level:            Number(n.level),  // garante número mesmo se a API retornar string
    parentId:         n.parent_id     ?? null,
    isSector:         Boolean(n.is_sector),
    photoUrl:         n.photo_url     ?? undefined,
    sectorColor:      n.sector_color  ?? undefined,
    sectorDirectorOf: n.sector_director_of ?? null,
    funcionarioId:    n.id_ent        ?? null,
  };
}

export interface GetOrgNodesParams {
  parentId?:  string | null;
  unidadeId?: string | null;
}

export async function getOrgNodes({ parentId, unidadeId }: GetOrgNodesParams = {}): Promise<OrgNode[]> {
  const params: Record<string, string> = {};
  if (parentId) params.parent_id = parentId;

  const [rawNodes, unitScope] = await Promise.all([
    fetchAllPages<VwNode>('/vw_organograma_nodes', 'nodes', params),
    unidadeId ? computeUnitScope(unidadeId) : Promise.resolve(null),
  ]);
  const nodes = rawNodes.map(toOrgNode);

  // Corrige co-diretores rebaixados incorretamente pela API externa: quando dois
  // funcionários têm o mesmo cargo de Diretoria (nível 0), a API mantém apenas um
  // no nível 0 e derruba o outro para nível 4 (Diretor de Setor), preso ao setor.
  // O card mesclado (nome "A & B", 1 foto) exige que ambos fiquem em nível 0 e
  // sem parent — aqui identificamos o co-diretor pelo mesmo nome de cargo do
  // diretor principal e restauramos seu nível/raiz corretos.
  const primaryDirector = nodes.find(n => !n.isSector && n.level === 0);
  if (primaryDirector) {
    primaryDirector.isPrimaryDirector = true;
    const primaryRoleNorm = normalizeName(primaryDirector.role);
    for (const n of nodes) {
      if (
        n !== primaryDirector &&
        !n.isSector &&
        n.level !== 0 &&
        normalizeName(n.role) === primaryRoleNorm
      ) {
        n.level = 0;
        n.parentId = null;
        n.isPrimaryDirector = false;
      }
    }
  }

  // Oculta setores que são apenas containers organizacionais (Diretoria, Gerência
  // Geral): seus filhos diretos "sobem" para o pai do setor oculto (cascateando
  // se houver mais de um nível oculto encadeado).
  const hiddenSectorIds = new Set(
    nodes.filter(n => n.isSector && HIDDEN_SECTOR_NAMES.has(normalizeName(n.name))).map(n => n.id),
  );
  const parentById = new Map(nodes.map(n => [n.id, n.parentId]));
  const resolveParent = (parentId: string | null): string | null => {
    let pid = parentId;
    const seen = new Set<string>();
    while (pid && hiddenSectorIds.has(pid) && !seen.has(pid)) {
      seen.add(pid);
      pid = parentById.get(pid) ?? null;
    }
    return pid;
  };
  const visible = hiddenSectorIds.size === 0 ? nodes : nodes
    .filter(n => !hiddenSectorIds.has(n.id))
    .map(n => ({ ...n, parentId: resolveParent(n.parentId) }));

  // Filtra por unidade. IMPORTANTE: pessoas nunca são removidas da resposta
  // aqui — quem decide o que exibir é o client (mergedNodes em OrgChart.tsx),
  // depois que a árvore inteira já chegou. Aqui só ANOTAMOS a unidade de cada
  // pessoa — inclusive Gerência Geral (nível 1): cada Gerente/Coordenador
  // Geral pertence a uma unidade específica, só a Diretoria (nível 0) é
  // papel global e aparece em todas.
  // Setores são a exceção segura: `visibleSectorIds` vem de /funcionarios +
  // /setores completos (não de BFS parcial), então ocultar um setor vazio
  // nunca corta a descoberta de conteúdo real.
  const finalNodes = !unitScope ? visible : visible
    .filter((n) => !n.isSector || unitScope.visibleSectorIds.has(canonId(n.id)))
    .map((n) => (
      n.isSector || n.level === 0
        ? n
        : { ...n, unidadeId: (n.funcionarioId != null ? unitScope.funcUnitMap.get(n.funcionarioId) : undefined) ?? null }
    ));

  return finalNodes;
}
