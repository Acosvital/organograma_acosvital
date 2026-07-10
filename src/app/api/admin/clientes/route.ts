import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { apiGet, handleApiError, extractArray } from '@/lib/apiClient';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const { searchParams } = new URL(request.url);
  // Limita tamanho e formato dos parâmetros — defesa em profundidade (já vão
  // codificados via encodeURIComponent em apiGet, mas evita abuso de payload gigante).
  const q     = (searchParams.get('q')?.trim() ?? '').slice(0, 200);
  const pageNum  = Math.max(1, Math.min(9999, Number(searchParams.get('page'))  || 1));
  const limitNum = Math.max(1, Math.min(100,  Number(searchParams.get('limit')) || 50));
  const page  = String(pageNum);
  const limit = String(limitNum);

  try {
    const raw = await apiGet<Record<string, unknown>>('/todos_os_clientes', { q, page, limit });

    const clientes = extractArray(raw, 'clientes');
    const meta     = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};

    return NextResponse.json({
      clientes,
      total: Number(meta.total ?? clientes.length),
      page:  Number(meta.page  ?? page),
      pages: Number(meta.totalPages ?? meta.pages ?? 1),
    });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar clientes.');
    return NextResponse.json({ error: msg }, { status });
  }
}
