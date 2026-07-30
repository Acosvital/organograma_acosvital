import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { getClientesAdminPage } from '@/lib/data/adminClientes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor' });
  if (error) return error;

  const { searchParams } = new URL(request.url);
  // Limita tamanho e formato dos parâmetros — defesa em profundidade (já vão
  // codificados via encodeURIComponent em apiGet, mas evita abuso de payload gigante).
  const q     = (searchParams.get('q')?.trim() ?? '').slice(0, 200);
  const page  = Math.max(1, Math.min(9999, Number(searchParams.get('page'))  || 1));
  const limit = Math.max(1, Math.min(100,  Number(searchParams.get('limit')) || 50));

  try {
    const result = await getClientesAdminPage({ q, page, limit });
    return NextResponse.json(result);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar clientes.');
    return NextResponse.json({ error: msg }, { status });
  }
}
