import { NextRequest, NextResponse } from 'next/server';
import { apiPut, apiDelete, handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { isValidUUID, badRequest, parseJsonBody } from '@/lib/validation';

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

  if (b.razao_social  !== undefined) patch.razao_social  = String(b.razao_social).trim();
  if (b.nome_fantasia !== undefined) patch.nome_fantasia = String(b.nome_fantasia).trim();
  if (b.tipo_unidade  !== undefined) patch.tipo_unidade  = b.tipo_unidade;
  if (b.matriz_id     !== undefined) patch.matriz_id     = b.matriz_id || null;
  if (b.nome_contato  !== undefined) patch.nome_contato  = String(b.nome_contato).trim();
  if (b.email         !== undefined) patch.email         = String(b.email).trim().toLowerCase();
  if (b.telefone      !== undefined) patch.telefone      = b.telefone || null;
  if (b.celular       !== undefined) patch.celular       = b.celular  || null;
  if (b.homepage      !== undefined) patch.homepage      = b.homepage || null;
  if (b.logradouro    !== undefined) patch.logradouro    = String(b.logradouro).trim();
  if (b.numero        !== undefined) patch.numero        = String(b.numero).trim();
  if (b.complemento   !== undefined) patch.complemento   = b.complemento || null;
  if (b.bairro        !== undefined) patch.bairro        = String(b.bairro).trim();
  if (b.cidade        !== undefined) patch.cidade        = String(b.cidade).trim();
  if (b.estado        !== undefined) patch.estado        = String(b.estado).trim().toUpperCase();
  if (b.cep !== undefined) {
    patch.cep = String(b.cep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  }
  if (b.latitude_y  !== undefined) patch.latitude_y  = b.latitude_y  != null ? Number(b.latitude_y)  : null;
  if (b.longitude_x !== undefined) patch.longitude_x = b.longitude_x != null ? Number(b.longitude_x) : null;

  if (patch.tipo_unidade === 'filial' && !patch.matriz_id) {
    return NextResponse.json({ error: 'Filial requer matriz_id.' }, { status: 422 });
  }

  try {
    const data = await apiPut(`/unidades/${id}`, patch);
    return NextResponse.json(data);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao atualizar unidade.');
    if (status === 404) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: 'Nome fantasia já em uso.' }, { status: 409 });
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
    await apiDelete(`/unidades/${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao excluir unidade.');
    if (status === 404) return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}
