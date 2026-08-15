import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSetoresList } from '@/lib/data/adminSetores';
import { getUnidadesList, matchesUnidade } from '@/lib/data/unidades';
import SetoresAdmin from '@/app/admin/setores/SetoresAdmin';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  return { title: `Setores — ${decodeURIComponent(codigo)} — Açosvital` };
}

export default async function AdminUnidadeSetoresPage({ params }: Props) {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);

  const unidades = await getUnidadesList().catch(() => []);
  const unidade = unidades.find(u => matchesUnidade(codigoEmpresa, u));
  if (!unidade) notFound();

  let setores: Awaited<ReturnType<typeof getSetoresList>> = [];
  try {
    setores = await getSetoresList();
  } catch {}

  return (
    <SetoresAdmin
      initialSetores={setores.filter(s => matchesUnidade(s.id_unidade, unidade))}
      unidade={unidade}
    />
  );
}
