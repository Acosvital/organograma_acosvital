import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/routeGuard';
import { getUnidadesMapa } from '@/lib/data/unidadesMapa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request);
  if (error) return error;

  try {
    const result = await getUnidadesMapa();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar unidades.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
