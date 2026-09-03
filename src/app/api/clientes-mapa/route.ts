import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/routeGuard';
import { getClientesMapa } from '@/lib/data/clientesMapa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);

  const filters: Record<string, string> = {};
  for (const k of ['nome_fantasia', 'cidade', 'estado', 'cep']) {
    const v = searchParams.get(k)?.trim();
    if (v) filters[k] = v;
  }

  try {
    const result = await getClientesMapa(filters);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar clientes.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
