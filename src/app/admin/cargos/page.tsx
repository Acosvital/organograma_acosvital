import type { Metadata } from 'next';
import { getCargosList } from '@/lib/data/adminCargos';
import CargosAdmin from './CargosAdmin';

export const metadata: Metadata = { title: 'Cargos — Açosvital' };
export const dynamic = 'force-dynamic';

export default async function AdminCargosPage() {
  let cargos: Awaited<ReturnType<typeof getCargosList>> = [];
  try {
    cargos = await getCargosList();
  } catch {}

  return <CargosAdmin initialCargos={cargos} />;
}
