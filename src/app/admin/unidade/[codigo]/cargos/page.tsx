import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCargosList } from '@/lib/data/adminCargos';
import { findUnidadeByCodigo } from '@/lib/data/unidades';
import CargosAdmin from '@/app/admin/cargos/CargosAdmin';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const unidadeParam = decodeURIComponent(codigo);
  const unidade = await findUnidadeByCodigo(unidadeParam);
  return { title: `Cargos — ${unidade?.nome_fantasia || unidadeParam} — Açosvital` };
}

export default async function AdminUnidadeCargosPage({ params }: Props) {
  const { codigo } = await params;
  const unidadeParam = decodeURIComponent(codigo);

  const [unidade, cargos] = await Promise.all([
    findUnidadeByCodigo(unidadeParam),
    getCargosList().catch(() => []),
  ]);
  if (!unidade) notFound();

  return (
    <CargosAdmin
      key={unidade.id}
      initialCargos={cargos}
      unidade={unidade}
    />
  );
}
