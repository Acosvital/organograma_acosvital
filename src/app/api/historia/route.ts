import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { getHistoriaContent } from '@/lib/data/historia';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request);
  if (error) return error;

  try {
    return NextResponse.json(await getHistoriaContent());
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Não foi possível carregar o conteúdo.');
    return NextResponse.json({ error: msg }, { status });
  }
}
