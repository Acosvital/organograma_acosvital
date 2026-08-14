import { NextRequest, NextResponse } from 'next/server';
import { apiPut, apiDelete, handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { isValidUUID, badRequest, validateNvlPermissao, parseJsonBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) return badRequest('ID inválido.');

  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (b.nome        !== undefined) patch.nome          = String(b.nome).trim();
  if (b.descricao   !== undefined) patch.descricao     = String(b.descricao).trim();
  if (b.ativo       !== undefined) patch.ativo         = Boolean(b.ativo);
  if (b.codigo_empresa !== undefined) patch.codigo_empresa = b.codigo_empresa || null;
  if (b.nvl_permissao !== undefined) {
    const nvl = Number(b.nvl_permissao);
    const nvlErr = validateNvlPermissao(nvl);
    if (nvlErr) return NextResponse.json({ error: nvlErr }, { status: 422 });
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

  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

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
