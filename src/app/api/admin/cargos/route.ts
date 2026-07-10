import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { apiPost, handleApiError, fetchAllPages } from '@/lib/apiClient';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';
import { verifySameOrigin, forbiddenOrigin } from '@/lib/validation';
import type { Cargo } from '@/types/adminCore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  try {
    const cargos = await fetchAllPages<Cargo>('/cargos', 'cargos');
    return NextResponse.json(cargos);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar cargos.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenOrigin();

  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'write');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  if (!b.nome || b.nvl_permissao === undefined || !b.descricao) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: nome, nvl_permissao, descricao.' },
      { status: 400 },
    );
  }

  const nvl = Number(b.nvl_permissao);
  if (nvl === 2 || nvl === 3) {
    return NextResponse.json(
      { error: 'Níveis 2 e 3 são reservados para setores e sub-setores.' },
      { status: 422 },
    );
  }
  if (nvl > 12) {
    return NextResponse.json(
      { error: 'Nível hierárquico máximo permitido é 12.' },
      { status: 422 },
    );
  }

  try {
    const data = await apiPost('/cargos', {
      nome:          String(b.nome).trim(),
      nvl_permissao: nvl,
      descricao:     String(b.descricao).trim(),
      ativo:         b.ativo !== false,
      id_origem:     b.id_origem ?? null,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao criar cargo.');
    if (status === 409) return NextResponse.json({ error: 'Já existe um cargo com este nome.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}
