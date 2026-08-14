import { requireAuth } from '@/lib/apiAuth';
import { getUnidadesList } from '@/lib/data/unidades';
import { getFuncionariosEnriched } from '@/lib/data/adminFuncionarios';
import type { Unidade } from '@/types/adminCore';
import type { PositionedNode } from '@/types/orgChart';
import OrganogramaOverview, { type UnidadeOverviewEntry } from './OrganogramaOverview';

export const dynamic = 'force-dynamic';

interface EnrichedFuncionario {
  id: string;
  nome_completo: string;
  id_unidade: string;
  cargo_nvl: number | null;
  photo_url: string | null;
  data_admissao: string | null;
}

/** Combina até 2 pessoas (ex: co-diretores ou os 2 gerentes de uma unidade) num único
 *  nó — quando há 2, o nome fica "A & B" e o CenterCard desenha o círculo dividido. */
function buildNode(id: string, role: string, pessoas: EnrichedFuncionario[]): PositionedNode | null {
  if (pessoas.length === 0) return null;
  const ordenadas = [...pessoas].sort((a, b) =>
    (a.data_admissao ?? '9999-99-99').localeCompare(b.data_admissao ?? '9999-99-99') ||
    a.nome_completo.localeCompare(b.nome_completo),
  );
  const escolhidas = ordenadas.slice(0, 2);
  return {
    id,
    role,
    name:     escolhidas.map(p => p.nome_completo).join(' & '),
    photoUrl: escolhidas.find(p => p.photo_url)?.photo_url ?? undefined,
    level:    0,
    parentId: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };
}

export default async function Home() {
  const auth = await requireAuth('viewer');

  let unidades: Unidade[] = [];
  let funcionarios: EnrichedFuncionario[] = [];
  let error = false;

  if (!auth.err) {
    try {
      const [u, f] = await Promise.all([getUnidadesList(), getFuncionariosEnriched()]);
      unidades = u;
      funcionarios = f as unknown as EnrichedFuncionario[];
    } catch {
      error = true;
    }
  }

  const directorsNode = buildNode('directors', 'Diretoria', funcionarios.filter(f => f.cargo_nvl === 0));

  const unidadesOrdenadas = [...unidades].sort((a, b) => {
    if (a.ordem_exibicao != null && b.ordem_exibicao != null) return a.ordem_exibicao - b.ordem_exibicao;
    if (a.ordem_exibicao != null) return -1;
    if (b.ordem_exibicao != null) return 1;
    return a.nome_fantasia.localeCompare(b.nome_fantasia);
  });

  const unidadesComGerentes: UnidadeOverviewEntry[] = unidadesOrdenadas.map(unidade => ({
    unidade,
    node: buildNode(
      unidade.id,
      unidade.nome_fantasia,
      funcionarios.filter(f => f.id_unidade === unidade.id && f.cargo_nvl === 1),
    ),
  }));

  return (
    <OrganogramaOverview
      directorsNode={directorsNode}
      unidadesComGerentes={unidadesComGerentes}
      error={error}
    />
  );
}
