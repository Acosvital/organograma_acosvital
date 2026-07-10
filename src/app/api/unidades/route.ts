import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { fetchAllPages, handleApiError } from '@/lib/apiClient';
import type { Unidade } from '@/types/adminCore';

export const dynamic = 'force-dynamic';

// Lista de unidades para a tela de seleção do organograma — acessível a
// qualquer usuário logado (viewer), diferente de /api/admin/unidades-rh que
// exige papel de editor.
export async function GET() {
  const { err } = await requireAuth('viewer');
  if (err) return err;

  try {
    const unidades = await fetchAllPages<Unidade>('/unidades', 'unidades');
    return NextResponse.json(unidades);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar unidades.');
    return NextResponse.json({ error: msg }, { status });
  }
}
