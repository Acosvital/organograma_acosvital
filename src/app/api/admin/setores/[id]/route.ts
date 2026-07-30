import { NextRequest, NextResponse } from 'next/server';
import { apiPut, apiDelete, handleApiError, fetchAllPages } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { isValidUUID, badRequest, parseJsonBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Busca o ID do nó do Gerente Geral (cargo nvl 1) no organograma via API externa. */
async function findGmNodeId(): Promise<string | null> {
  const [cargos, funcionarios, orgNodes] = await Promise.all([
    fetchAllPages<{ id: string; nvl_permissao: number }>('/cargos', 'cargos'),
    fetchAllPages<{ id: string; id_cargo: string }>('/funcionarios', 'funcionarios'),
    fetchAllPages<{ id: string; id_ent: string | null; is_sector: boolean }>('/organograma_nodes', 'organograma_nodes'),
  ]);

  const gmCargoIds = new Set(cargos.filter(c => c.nvl_permissao === 1).map(c => c.id));
  const gmFuncIds  = new Set(funcionarios.filter(f => gmCargoIds.has(f.id_cargo)).map(f => f.id));
  const gmNode     = orgNodes.find(n => !n.is_sector && n.id_ent != null && gmFuncIds.has(n.id_ent));
  return gmNode?.id ?? null;
}

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

  if (b.nome         !== undefined) patch.nome         = String(b.nome).trim();
  if (b.descricao    !== undefined) patch.descricao    = String(b.descricao).trim();
  if (b.ativo        !== undefined) patch.ativo        = Boolean(b.ativo);
  if (b.sigla        !== undefined) patch.sigla        = b.sigla ? String(b.sigla).trim().toUpperCase() : null;
  if (b.cor_setor    !== undefined) patch.cor_setor    = b.cor_setor    || null;
  if (b.parent_id    !== undefined) patch.parent_id    = b.parent_id    || null;
  if (b.codigo_setor !== undefined) patch.codigo_setor = b.codigo_setor ? String(b.codigo_setor).trim().toUpperCase() : null;

  if (patch.parent_id === id) {
    return NextResponse.json({ error: 'Um setor não pode ser pai de si mesmo.' }, { status: 422 });
  }

  // Setor reparentado: recalcula nivel = nível do novo pai + 1 (raiz = 2).
  // Sem isso o setor fica "preso" no nivel antigo e some/aparece no lugar errado.
  if (b.parent_id !== undefined) {
    if (b.parent_id) {
      try {
        const setores = await fetchAllPages<{ id: string; nivel: number | null }>('/setores', 'setores');
        const parent = setores.find(s => s.id === String(b.parent_id));
        patch.nivel = (parent?.nivel ?? 2) + 1;
      } catch { patch.nivel = 3; }
    } else {
      patch.nivel = 2;
    }
  }

  try {
    const data = await apiPut(`/setores/${id}`, patch);

    // Sincroniza parent_id do nó no organograma quando o setor-pai mudou
    if (b.parent_id !== undefined) {
      try {
        let parentNodeId: string | null = null;

        if (b.parent_id) {
          // Sub-setor: pai = UUID do setor-pai (setor usa seu próprio UUID como node id)
          parentNodeId = String(b.parent_id);
        } else {
          // Virou setor raiz: pai = Gerente Geral (cargo nvl 1) via API externa
          parentNodeId = await findGmNodeId();
        }

        await apiPut(`/organograma_nodes/${id}`, { parent_id: parentNodeId });
      } catch { /* best-effort: não bloqueia a resposta */ }
    }

    return NextResponse.json(data);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao atualizar setor.');
    if (status === 404) return NextResponse.json({ error: 'Setor não encontrado.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: 'Nome ou código já em uso.' }, { status: 409 });
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

  // 1. Descobre funcionários vinculados ao setor
  let affectedIds: string[] = [];
  try {
    const employees = await fetchAllPages<{ id: string; id_setor: string }>('/funcionarios', 'funcionarios');
    affectedIds = employees.filter(f => f.id_setor === id).map(f => f.id);
  } catch { /* continua sem a lista — tentará deletar o setor mesmo assim */ }

  // 2. Desvincula funcionários do setor (API externa não permite deletar setor com funcionários)
  if (affectedIds.length > 0) {
    await Promise.allSettled(
      affectedIds.map(fId => apiPut(`/funcionarios/${fId}`, { id_setor: null })),
    );
  }

  // 3. Exclui o setor
  try {
    await apiDelete(`/setores/${id}`);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao excluir setor.');
    if (status === 400) {
      return NextResponse.json(
        { error: 'Não foi possível excluir o setor pois ainda há funcionários vinculados. Realoque-os manualmente e tente novamente.' },
        { status: 409 },
      );
    }
    if (status === 404) return NextResponse.json({ error: 'Setor não encontrado.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: msg }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }

  // 4. Remove org nodes (setor + funcionários que estavam nele) em paralelo
  await Promise.allSettled([
    apiDelete(`/organograma_nodes/${id}`),
    ...affectedIds.map(fId => apiDelete(`/organograma_nodes/${fId}`)),
  ]);

  return NextResponse.json({ ok: true });
}
