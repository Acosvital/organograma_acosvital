import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/routeGuard';
import { handleApiError } from '@/lib/apiClient';
import { getOrgNodes } from '@/lib/data/org';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'viewer' });
  if (error) return error;

  try {
    // Suporte a ?parent_id=<uuid> para busca lazy dos filhos de um setor
    const parentId  = request.nextUrl.searchParams.get('parent_id');
    // Suporte a ?unidade_id=<uuid> para filtrar o organograma por unidade
    const unidadeId = request.nextUrl.searchParams.get('unidade_id');

    const finalNodes = await getOrgNodes({ parentId, unidadeId });
    return NextResponse.json(finalNodes);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar dados do organograma.');
    return NextResponse.json({ error: msg }, { status });
  }
}
