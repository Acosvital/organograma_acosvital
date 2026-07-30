import type { Metadata } from 'next';
import { getSetoresList } from '@/lib/data/adminSetores';
import SetoresAdmin from './SetoresAdmin';

export const metadata: Metadata = { title: 'Setores — Açosvital' };
export const dynamic = 'force-dynamic';

export default async function AdminSetoresPage() {
  let setores: Awaited<ReturnType<typeof getSetoresList>> = [];
  try {
    setores = await getSetoresList();
  } catch {}

  return <SetoresAdmin initialSetores={setores} />;
}
