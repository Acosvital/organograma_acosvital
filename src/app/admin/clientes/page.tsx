import type { Metadata } from 'next';
import { getClientesAdminPage } from '@/lib/data/adminClientes';
import ClientesAdmin, { type Cliente } from './ClientesAdmin';

export const metadata: Metadata = {
  title: 'Clientes — Açosvital',
};

export const dynamic = 'force-dynamic';

export default async function AdminClientesPage() {
  let initial: Awaited<ReturnType<typeof getClientesAdminPage>> | null = null;
  try {
    initial = await getClientesAdminPage();
  } catch {}

  return (
    <ClientesAdmin
      initialClientes={(initial?.clientes ?? []) as unknown as Cliente[]}
      initialTotal={initial?.total ?? 0}
      initialPage={initial?.page ?? 1}
      initialPages={initial?.pages ?? 1}
    />
  );
}
