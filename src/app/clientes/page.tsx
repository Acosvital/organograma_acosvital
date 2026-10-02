import { redirect } from 'next/navigation';
import { requireAuth, canViewClientes } from '@/lib/apiAuth';
import { getClientesMapa } from '@/lib/data/clientesMapa';
import ClientesView from './ClientesView';
import type { ApiCliente } from '@/types/client';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const auth = await requireAuth();

  if (auth.err?.status === 401) {
    redirect('/login?next=%2Fclientes');
  }

  // Quantidade, distribuição por região e os pontos no mapa aparecem pra
  // qualquer usuário autenticado — só a lista de nomes embaixo (e o painel de
  // detalhe ao clicar) exige a permissão `organograma-clientes`.
  const podeVerDetalhes = await canViewClientes();

  let clientes: ApiCliente[] = [];
  if (!auth.err) {
    try {
      const result = await getClientesMapa();
      clientes = result.clientes as ApiCliente[];
    } catch {}
  }

  return <ClientesView canViewDetails={podeVerDetalhes} initialClientes={clientes} />;
}
