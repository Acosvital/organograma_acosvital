import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { ApiError, apiGet, apiPost, apiPut, apiDelete, handleApiError, API_CACHE_TAG } from '@/lib/apiClient';
import { recomputeSectorHierarchy } from '@/lib/sectorHierarchy';
import { guard } from '@/lib/routeGuard';
import { parseJsonBody } from '@/lib/validation';
import { getFuncionariosEnriched } from '@/lib/data/adminFuncionarios';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor' });
  if (error) return error;

  try {
    const enriched = await getFuncionariosEnriched();
    return NextResponse.json(enriched);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar funcionários.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;
  const required = ['nome_completo', 'id_cargo', 'id_setor', 'codigo_empresa'];
  const missing  = required.filter(k => !b[k]);
  if (missing.length) {
    return NextResponse.json({ error: `Campos obrigatórios: ${missing.join(', ')}.` }, { status: 400 });
  }

  // Busca o cargo para saber o nvl_permissao
  let cargoNvl = 4;
  try {
    const raw = await apiGet<unknown>(`/cargos/${String(b.id_cargo)}`);
    const obj = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? raw as Record<string, unknown>
      : {};
    const nvlRaw = obj.nvl_permissao
      ?? (obj.cargo as Record<string, unknown> | undefined)?.nvl_permissao;
    cargoNvl = typeof nvlRaw === 'number' ? nvlRaw : 4;
  } catch {
    return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 422 });
  }

  const skipOrgNode = b.skip_org_node === true;

  // Cria o funcionário
  let funcData: { id: string };
  try {
    const rawPost = await apiPost<unknown>('/funcionarios', {
      nome_completo:     String(b.nome_completo).trim(),
      id_cargo:          String(b.id_cargo),
      id_setor:          String(b.id_setor),
      codigo_empresa:    String(b.codigo_empresa),
      photo_url:         b.photo_url         || null,
      cpf:               b.cpf               ? String(b.cpf).replace(/\D/g, '') : null,
      rg:                b.rg                || null,
      cnpj:              b.cnpj              || null,
      contrato_tipo:     b.contrato_tipo     || null,
      jornada_trabalho:  b.jornada_trabalho  || null,
      data_nascimento:   b.data_nascimento   || null,
      data_admissao:     b.data_admissao     || null,
      data_desligamento: b.data_desligamento || null,
      telefone:          b.telefone          || null,
      celular:           b.celular           || null,
      homepage:          b.homepage          || null,
      logradouro:        b.logradouro        || null,
      numero:            b.numero            || null,
      complemento:       b.complemento       || null,
      bairro:            b.bairro            || null,
      cidade:            b.cidade            || null,
      estado:            b.estado            ? String(b.estado).toUpperCase() : null,
      cep:               b.cep               ? String(b.cep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2') : null,
    });
    // API pode retornar { id: "..." } ou { funcionario: { id: "..." }, ... }
    const postObj = (rawPost && typeof rawPost === 'object' && !Array.isArray(rawPost))
      ? rawPost as Record<string, unknown> : {};
    const inner = (postObj.funcionario as Record<string, unknown> | undefined) ?? postObj;
    funcData = inner as { id: string };
    if (!funcData.id || typeof funcData.id !== 'string') {
      // Loga apenas as chaves recebidas, nunca os valores (evita gravar CPF/RG/telefone em texto claro nos logs).
      console.error('[api/admin/funcionarios POST] API não retornou id. Chaves recebidas:', Object.keys(postObj));
      return NextResponse.json({ error: 'API não retornou ID do funcionário criado.' }, { status: 500 });
    }
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao criar funcionário.');
    if (status === 409) return NextResponse.json({ error: 'CPF ou CNPJ já cadastrado.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }

  // skip_org_node foi removido: todos os diretores criam nó próprio no organograma.
  // Mantido apenas para compatibilidade com chamadas legadas (não deve ser enviado).
  if (skipOrgNode) {
    revalidateTag(API_CACHE_TAG, 'max');
    return NextResponse.json({ ...funcData }, { status: 201 });
  }

  // Determina o parent_id do nó no organograma.
  // Prioridade: parent_node_id explícito > hierarquia automática > setor.
  let orgParentId: string | null = null;
  if (b.parent_node_id && typeof b.parent_node_id === 'string') {
    orgParentId = b.parent_node_id;
  } else if (cargoNvl <= 1) {
    orgParentId = null;
  } else {
    try {
      const parentMap = await recomputeSectorHierarchy(String(b.id_setor), {
        includeNew: { id: funcData.id, nvl: cargoNvl },
      });
      orgParentId = parentMap.get(funcData.id) ?? String(b.id_setor);
    } catch {
      orgParentId = String(b.id_setor);
    }
  }

  // Cria o nó no organograma. Se já existir (409 — tentativa anterior incompleta),
  // tenta corrigir o id_ent via PUT em vez de abortar.
  try {
    await apiPost('/organograma_nodes', {
      id:        funcData.id,
      id_ent:    funcData.id,
      parent_id: orgParentId,
      is_sector: false,
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      // Nó já existe — pode ter id_ent errado de uma criação anterior; tenta corrigir.
      try {
        await apiPut(`/organograma_nodes/${funcData.id}`, {
          id_ent:    funcData.id,
          parent_id: orgParentId,
        });
      } catch {
        // PUT também falhou — rollback do funcionário
        try { await apiDelete(`/funcionarios/${funcData.id}`); } catch { /* best-effort */ }
        return NextResponse.json(
          { error: 'Não foi possível criar ou reparar o nó no organograma.' },
          { status: 500 },
        );
      }
    } else {
      // Outro erro — rollback do funcionário
      try { await apiDelete(`/funcionarios/${funcData.id}`); } catch { /* best-effort */ }
      const { msg } = handleApiError(e);
      return NextResponse.json(
        { error: `Funcionário criado mas falha ao criar nó no organograma: ${msg}` },
        { status: 500 },
      );
    }
  }

  revalidateTag(API_CACHE_TAG, 'max');
  return NextResponse.json({ ...funcData, org_node_id: funcData.id }, { status: 201 });
}
