import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { ApiError, apiGet, apiPost, apiPut, apiDelete, handleApiError } from '@/lib/apiClient';
import { recomputeSectorHierarchy } from '@/lib/sectorHierarchy';
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

  const strNullable = ['photo_url', 'rg', 'cnpj', 'contrato_tipo', 'jornada_trabalho',
                       'telefone', 'celular', 'homepage', 'logradouro', 'numero',
                       'complemento', 'bairro', 'cidade',
                       'data_nascimento', 'data_admissao', 'data_desligamento'] as const;

  for (const f of strNullable) {
    if (b[f] !== undefined) patch[f] = b[f] || null;
  }

  if (b.nome_completo !== undefined) patch.nome_completo = String(b.nome_completo).trim();
  if (b.id_cargo      !== undefined) patch.id_cargo      = String(b.id_cargo);
  if (b.id_setor      !== undefined) patch.id_setor      = String(b.id_setor);
  if (b.id_unidade    !== undefined) patch.id_unidade    = String(b.id_unidade);
  // parent_node_id é tratado separadamente para o org node — não vai para /funcionarios
  if (b.estado        !== undefined) patch.estado        = b.estado ? String(b.estado).toUpperCase() : null;
  if (b.cpf           !== undefined) patch.cpf           = b.cpf ? String(b.cpf).replace(/\D/g, '') : null;
  if (b.cep !== undefined) {
    patch.cep = b.cep
      ? String(b.cep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2')
      : null;
  }

  // Busca estado atual para comparar e detectar mudanças reais de cargo/setor.
  // Necessário para não recomputar a hierarquia em edições que não alteram estrutura
  // (ex.: trocar foto ou telefone), o que sobrescreveria escolhas manuais de "reporta a".
  let oldSectorId: string | null = null;
  let oldCargoId:  string | null = null;
  try {
    const raw = await apiGet<unknown>(`/funcionarios/${id}`);
    const obj  = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
    const func = (obj.funcionario as Record<string, unknown> | undefined) ?? obj;
    oldSectorId = typeof func.id_setor === 'string' ? func.id_setor : null;
    oldCargoId  = typeof func.id_cargo === 'string' ? func.id_cargo : null;
  } catch { /* best-effort */ }

  // Só recomputa quando o valor REALMENTE muda (não apenas quando o campo está presente).
  const cargoChanged  = b.id_cargo !== undefined && String(b.id_cargo)  !== (oldCargoId  ?? '');
  const sectorChanged = b.id_setor !== undefined && b.id_setor !== ''   && String(b.id_setor) !== (oldSectorId ?? '');

  try {
    const data = await apiPut(`/funcionarios/${id}`, patch);

    const explicitParent = b.parent_node_id && typeof b.parent_node_id === 'string'
      ? b.parent_node_id as string
      : null;

    // Recomputa hierarquia automática do(s) setor(es) afetado(s).
    // Quando há um "reporta a" explícito, AWAITA a recomputa antes de sobrescrever —
    // caso contrário a recomputa venceria a corrida e apagaria a escolha do usuário.
    if (sectorChanged || cargoChanged) {
      const newSectorId = sectorChanged ? String(b.id_setor) : (oldSectorId ?? null);

      if (newSectorId) {
        if (explicitParent) {
          await recomputeSectorHierarchy(newSectorId).catch(() => {/* best-effort */});
        } else {
          recomputeSectorHierarchy(newSectorId).catch(() => {/* best-effort */});
        }
      }

      // Se o setor mudou, recomputa o setor antigo (alguém podia reportar a este funcionário)
      if (sectorChanged && oldSectorId && oldSectorId !== newSectorId) {
        recomputeSectorHierarchy(oldSectorId, { excludeId: id }).catch(() => {/* best-effort */});
      }
    }

    // Aplica o "reporta a" explícito DEPOIS da recomputa para não ser sobrescrito.
    if (explicitParent) {
      await apiPut(`/organograma_nodes/${id}`, { parent_id: explicitParent }).catch(() => {/* best-effort */});
    }

    // Garante nó no organograma para diretores que ficaram sem nó
    // (bug legado: co-diretores eram criados com skip_org_node=true)
    if (b.id_cargo !== undefined) {
      try {
        const cargoRaw = await apiGet<unknown>(`/cargos/${String(b.id_cargo)}`);
        const cargoObj = (cargoRaw && typeof cargoRaw === 'object' && !Array.isArray(cargoRaw))
          ? cargoRaw as Record<string, unknown> : {};
        const nvlRaw = cargoObj.nvl_permissao
          ?? (cargoObj.cargo as Record<string, unknown> | undefined)?.nvl_permissao;
        const nvl = typeof nvlRaw === 'number' ? nvlRaw : 9;

        if (nvl <= 1) {
          // Garante que o nó existe e tem id_ent correto (repara nós legados com id_ent nulo)
          try {
            const existingRaw = await apiGet<unknown>(`/organograma_nodes/${id}`);
            const existObj = (existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw))
              ? existingRaw as Record<string, unknown> : {};
            const existInner = (existObj.organograma_node as Record<string, unknown> | undefined) ?? existObj;
            if (!existInner.id_ent || existInner.id_ent !== id) {
              await apiPut(`/organograma_nodes/${id}`, { id_ent: id, parent_id: null });
            }
          } catch {
            // Nó não existe — cria como raiz
            try {
              await apiPost('/organograma_nodes', { id, id_ent: id, parent_id: null, is_sector: false });
            } catch { /* best-effort */ }
          }
        }
      } catch { /* best-effort: não bloqueia o save se falhar */ }
    }

    return NextResponse.json(data);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao atualizar funcionário.');
    if (status === 404) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
    if (status === 409) return NextResponse.json({ error: 'CPF ou CNPJ já cadastrado.' }, { status: 409 });
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

  // Obtém o setor antes de deletar para recomputar a hierarquia depois
  let sectorId: string | null = null;
  try {
    const raw = await apiGet<unknown>(`/funcionarios/${id}`);
    const obj  = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
    const func = (obj.funcionario as Record<string, unknown> | undefined) ?? obj;
    sectorId = typeof func.id_setor === 'string' ? func.id_setor : null;
  } catch { /* best-effort */ }

  try {
    await apiDelete(`/funcionarios/${id}`);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao excluir funcionário.');
    if (status === 404) return NextResponse.json({ error: 'Funcionário não encontrado.' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status });
  }

  // Remove o nó correspondente no organograma (best-effort)
  try { await apiDelete(`/organograma_nodes/${id}`); } catch { /* ignora se já não existir */ }

  // Recomputa hierarquia do setor após remoção do funcionário
  if (sectorId) {
    recomputeSectorHierarchy(sectorId, { excludeId: id }).catch(() => {/* best-effort */});
  }

  return NextResponse.json({ ok: true });
}
