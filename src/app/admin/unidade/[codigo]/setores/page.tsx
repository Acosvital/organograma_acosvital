import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSetoresList } from '@/lib/data/adminSetores';
import { findUnidadeByCodigo } from '@/lib/data/unidades';
import SetoresAdmin from '@/app/admin/setores/SetoresAdmin';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const unidadeParam = decodeURIComponent(codigo);
  const unidade = await findUnidadeByCodigo(unidadeParam);
  return { title: `Setores — ${unidade?.nome_fantasia || unidadeParam} — Açosvital` };
}

export default async function AdminUnidadeSetoresPage({ params }: Props) {
  const { codigo } = await params;
  const unidadeParam = decodeURIComponent(codigo);

  const [unidade, setores] = await Promise.all([
    findUnidadeByCodigo(unidadeParam),
    getSetoresList().catch(() => []),
  ]);
  if (!unidade) notFound();

  return (
    <SetoresAdmin
      key={unidade.id}
      initialSetores={setores}
      unidade={unidade}
    />
  );
}
