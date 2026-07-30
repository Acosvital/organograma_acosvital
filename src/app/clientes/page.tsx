import { getMyRole } from '@/lib/apiAuth';
import { getClientesMapa } from '@/lib/data/clientesMapa';
import ClientesView from './ClientesView';
import type { ApiCliente } from '@/types/client';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const role = await getMyRole();
  const canViewDetails = role === 'admin' || role === 'editor';
  const canViewData    = role === 'admin' || role === 'editor' || role === 'viewer';

  let clientes: ApiCliente[] = [];
  if (canViewData) {
    try {
      const result = await getClientesMapa();
      clientes = result.clientes as ApiCliente[];
    } catch {}
  }

  return <ClientesView canViewDetails={canViewDetails} initialClientes={clientes} />;
}
