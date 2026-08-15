import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFuncionariosEnriched } from '@/lib/data/adminFuncionarios';
import { getCargosList } from '@/lib/data/adminCargos';
import { getSetoresList } from '@/lib/data/adminSetores';
import { getUnidadesList, matchesUnidade } from '@/lib/data/unidades';
import type { Funcionario, Cargo, Setor, Unidade } from '@/types/adminCore';
import FuncionariosAdmin from '@/app/admin/funcionarios/FuncionariosAdmin';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);
  const unidades = await getUnidadesList().catch(() => []);
  const unidade = unidades.find(u => matchesUnidade(codigoEmpresa, u));
  return { title: `Funcionários — ${unidade?.nome_fantasia || codigoEmpresa} — Açosvital` };
}

export default async function AdminUnidadeFuncionariosPage({ params }: Props) {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);

  const [funcionarios, cargos, setores, unidades] = await Promise.allSettled([
    getFuncionariosEnriched(),
    getCargosList(),
    getSetoresList(),
    getUnidadesList(),
  ]);

  const unidadesList = unidades.status === 'fulfilled' ? unidades.value as Unidade[] : [];
  const unidade = unidadesList.find(u => matchesUnidade(codigoEmpresa, u));
  if (!unidade) notFound();

  return (
    <FuncionariosAdmin
      key={unidade.id}
      initialFuncionarios={funcionarios.status === 'fulfilled' ? funcionarios.value as unknown as Funcionario[] : []}
      initialCargos={cargos.status === 'fulfilled' ? (cargos.value as Cargo[]).filter(c => matchesUnidade(c.codigo_empresa, unidade)) : []}
      initialSetores={setores.status === 'fulfilled' ? (setores.value as Setor[]).filter(s => matchesUnidade(s.id_unidade, unidade)) : []}
      initialUnidades={[unidade]}
      unidade={unidade}
    />
  );
}
