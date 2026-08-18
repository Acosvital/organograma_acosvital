import type { Metadata } from 'next';
import { getUnidadesList } from '@/lib/data/unidades';
import { getOrganogramaCardImages } from '@/lib/data/organogramaCards';
import UnidadesCadastroAdmin from './UnidadesCadastroAdmin';

export const metadata: Metadata = { title: 'Unidades — Açosvital' };
export const dynamic = 'force-dynamic';

export default async function AdminUnidadesCadastroPage() {
  let unidades: Awaited<ReturnType<typeof getUnidadesList>> = [];
  try {
    unidades = await getUnidadesList();
  } catch {}
  const cardImages = await getOrganogramaCardImages();

  return <UnidadesCadastroAdmin initialUnidades={unidades} initialCardImages={cardImages} />;
}
