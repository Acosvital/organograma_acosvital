import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { getUnidadesList } from '@/lib/data/unidades';

export const dynamic = 'force-dynamic';

// Lista de unidades para a tela de seleção do organograma — acessível a
// qualquer usuário logado (viewer), diferente de /api/admin/unidades-rh que
// exige papel de editor.
export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'viewer' });
  if (error) return error;

  try {
    const unidades = await getUnidadesList();
    return NextResponse.json(unidades);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar unidades.');
    return NextResponse.json({ error: msg }, { status });
  }
}
