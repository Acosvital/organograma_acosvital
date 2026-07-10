import { NextRequest, NextResponse } from 'next/server';
import { apiGet, extractArray } from '@/lib/apiClient';
import { requireAuth } from '@/lib/apiAuth';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

interface ApiPage {
  clientes?: unknown[];
  total?:    number;
  page?:     number;
  pages?:    number;
  [k: string]: unknown;
}

const LIMIT = 100;

export async function GET(request: NextRequest) {
  const { err } = await requireAuth('viewer');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  const { searchParams } = new URL(request.url);

  const filters: Record<string, string> = {};
  for (const k of ['nome_fantasia', 'cidade', 'estado', 'cep']) {
    const v = searchParams.get(k)?.trim();
    if (v) filters[k] = v;
  }

  let firstPage: ApiPage;
  try {
    firstPage = await apiGet<ApiPage>('/todos_os_clientes', {
      ...filters,
      page:  '1',
      limit: String(LIMIT),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar clientes.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const totalPages = Number(firstPage.totalPages ?? firstPage.pages ?? 1);
  let all = extractArray(firstPage, 'clientes');

  // Busca páginas restantes em paralelo
  if (totalPages > 1) {
    const pages = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        apiGet<ApiPage>('/todos_os_clientes', {
          ...filters,
          page:  String(i + 2),
          limit: String(LIMIT),
        }).then(r => extractArray(r, 'clientes')),
      ),
    );
    for (const r of pages) {
      if (r.status === 'fulfilled') all = [...all, ...r.value];
    }
  }

  return NextResponse.json({
    clientes: all,
    total:    Number(firstPage.total ?? all.length),
  });
}
