import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { apiPut, apiDelete, handleApiError } from '@/lib/apiClient';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';
import { isValidUUID, badRequest, verifySameOrigin, forbiddenOrigin } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) return badRequest('ID inválido.');
  if (!verifySameOrigin(request)) return forbiddenOrigin();

  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'write');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (b.nome        !== undefined) patch.nome          = String(b.nome).trim();
  if (b.descricao   !== undefined) patch.descricao     = String(b.descricao).trim();
  if (b.ativo       !== undefined) patch.ativo         = Boolean(b.ativo);
  if (b.nvl_permissao !== undefined) {
    const nvl = Number(b.nvl_permissao);
    if (nvl === 2 || nvl === 3) {
      return NextResponse.json({ error: 'Níveis 2 e 3 são reservados para setores.' }, { status: 422 });
    }
    if (nvl > 12) {
      return NextResponse.json({ error: 'Nível hierárquico máximo permitido é 12.' }, { status: 422 });
    }
    patch.nvl_permissao = nvl;
  }

  try {
    const data = await apiPut(`/cargos/${id}`, patch);
    return NextResponse.json(data);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao atualizar cargo.');
    if (status === 404) return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: 'Nome já em uso.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) return badRequest('ID inválido.');
  if (!verifySameOrigin(request)) return forbiddenOrigin();

  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'write');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  try {
    await apiDelete(`/cargos/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao excluir cargo.');
    if (status === 404) return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}
