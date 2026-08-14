import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCargosList } from '@/lib/data/adminCargos';
import { getUnidadesList } from '@/lib/data/unidades';
import CargosAdmin from '@/app/admin/cargos/CargosAdmin';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Cargos — ${decodeURIComponent(codigo)} — Açosvital` };
}

export default async function AdminUnidadeCargosPage({ params }: Props) {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);

  const unidades = await getUnidadesList().catch(() => []);
  const unidade = unidades.find(u => u.codigo_empresa === codigoEmpresa);
  if (!unidade) notFound();

  let cargos: Awaited<ReturnType<typeof getCargosList>> = [];
  try {
    cargos = await getCargosList();
  } catch {}

  return (
    <CargosAdmin
      initialCargos={cargos.filter(c => c.codigo_empresa === codigoEmpresa)}
      unidadeCodigo={codigoEmpresa}
      unidadeNome={unidade.nome_fantasia}
    />
  );
}
