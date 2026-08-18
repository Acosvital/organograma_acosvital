import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { apiPost, handleApiError, API_CACHE_TAG } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { validateNvlPermissao, parseJsonBody } from '@/lib/validation';
import { getCargosList } from '@/lib/data/adminCargos';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor' });
  if (error) return error;

  try {
    const cargos = await getCargosList();
    return NextResponse.json(cargos);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar cargos.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;
  if (!b.nome || b.nvl_permissao === undefined || !b.descricao) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: nome, nvl_permissao, descricao.' },
      { status: 400 },
    );
  }

  const nvl = Number(b.nvl_permissao);
  const nvlErr = validateNvlPermissao(nvl);
  if (nvlErr) return NextResponse.json({ error: nvlErr }, { status: 422 });

  try {
    const data = await apiPost('/cargos', {
      nome:          String(b.nome).trim(),
      nvl_permissao: nvl,
      descricao:     String(b.descricao).trim(),
      ativo:         b.ativo !== false,
      codigo_empresa: b.codigo_empresa || null,
      id_origem:     b.id_origem ?? null,
    });
    revalidateTag(API_CACHE_TAG, 'max');
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao criar cargo.');
    if (status === 409) return NextResponse.json({ error: 'Já existe um cargo com este nome.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}
