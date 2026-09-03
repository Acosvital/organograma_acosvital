import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/apiAuth';
import { getUnidadesList } from '@/lib/data/unidades';
import { getFuncionariosEnriched } from '@/lib/data/adminFuncionarios';
import { getOrgNodes } from '@/lib/data/org';
import { getOrganogramaCardConfigs } from '@/lib/data/organogramaCards';
import { mergeDirectors } from '@/utils/mergeDirectors';
import type { Unidade } from '@/types/adminCore';
import type { PositionedNode } from '@/types/orgChart';
import OrganogramaOverview, { type UnidadeOverviewEntry } from './OrganogramaOverview';
import KioskAutoRefresh from '@/components/KioskAutoRefresh';

export const dynamic = 'force-dynamic';

interface EnrichedFuncionario {
  id: string;
  nome_completo: string;
  codigo_empresa: string;
  cargo_nvl: number | null;
  photo_url: string | null;
  data_admissao: string | null;
}

/** Combina os 2 gerentes de uma unidade num único nó — o nome fica "A & B" e
 *  o CenterCard desenha o círculo dividido, cada um com sua própria foto.
 *  Quando a unidade tem uma imagem de empresa configurada (Administrar →
 *  Cadastrar unidades), ela substitui a(s) foto(s) do(s) gerente(s) no
 *  círculo — o nome deles continua aparecendo embaixo do card normalmente. */
function buildNode(id: string, role: string, pessoas: EnrichedFuncionario[], cardImageUrl?: string): PositionedNode | null {
  if (pessoas.length === 0) return null;
  const ordenadas = [...pessoas].sort((a, b) =>
    (a.data_admissao ?? '9999-99-99').localeCompare(b.data_admissao ?? '9999-99-99') ||
    a.nome_completo.localeCompare(b.nome_completo),
  );
  const escolhidas = ordenadas.slice(0, 2);
  return {
    id,
    role,
    name:      escolhidas.map(p => p.nome_completo).join(' & '),
    photoUrl:  cardImageUrl ?? escolhidas[0]?.photo_url ?? undefined,
    photoUrl2: cardImageUrl ? undefined : escolhidas[1]?.photo_url ?? undefined,
    level:    0,
    parentId: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };
}

/** Diretoria é papel global (vem de /vw_organograma_nodes, não de /funcionarios)
 *  para reusar a mesma correção de co-diretor/foto do organograma por unidade
 *  (ver isPrimaryDirector em org.ts) — evita escolher a foto de quem só tem
 *  admissão mais antiga quando o diretor principal tem a foto correta. */
function buildDirectorsNode(directors: { id: string; role: string; name: string; photoUrl?: string; isPrimaryDirector?: boolean }[]): PositionedNode | null {
  if (directors.length === 0) return null;
  return {
    id: 'directors',
    role: 'Diretoria',
    ...mergeDirectors(directors),
    level: 0,
    parentId: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };
}

export default async function Home() {
  const auth = await requireAuth();

  // Sessão expirada/ausente: manter a tela renderizando "vazia" faz um quiosque
  // desassistido parecer travado com dados incorretos. Manda pro login (e volta
  // pra cá depois) em vez de mascarar o problema. Outras falhas de auth (403/503)
  // não têm solução em re-logar — tratadas abaixo como erro de carregamento normal.
  if (auth.err?.status === 401) {
    redirect('/login?next=%2F');
  }

  // Independente da API externa (Acosvital) — mora no S3/SeaweedFS, então
  // continua funcionando mesmo se a API de organograma estiver fora do ar.
  const cardConfigs = await getOrganogramaCardConfigs();

  let unidades: Unidade[] = [];
  let funcionarios: EnrichedFuncionario[] = [];
  let directorsNode: PositionedNode | null = null;
  let error = !!auth.err;

  if (!auth.err) {
    try {
      const [u, f, orgNodes] = await Promise.all([getUnidadesList(), getFuncionariosEnriched(), getOrgNodes()]);
      unidades = u;
      funcionarios = f as unknown as EnrichedFuncionario[];
      directorsNode = buildDirectorsNode(orgNodes.filter(n => !n.isSector && n.level === 0));
    } catch {
      error = true;
    }
  }

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
      funcionarios.filter(f => f.codigo_empresa === unidade.id && f.cargo_nvl === 1),
      cardConfigs[unidade.id]?.imageUrl ?? undefined,
    ),
    cardColor: cardConfigs[unidade.id]?.color ?? null,
  }));

  return (
    <>
      <KioskAutoRefresh hasError={error} />
      <OrganogramaOverview
        directorsNode={directorsNode}
        unidadesComGerentes={unidadesComGerentes}
        error={error}
      />
    </>
  );
}
