import { NextRequest, NextResponse } from 'next/server';
import { apiPost, apiDelete, handleApiError, fetchAllPages } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { parseJsonBody } from '@/lib/validation';
import { getSetoresList } from '@/lib/data/adminSetores';

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

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor' });
  if (error) return error;

  try {
    const setores = await getSetoresList();
    return NextResponse.json(setores);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar setores.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;
  if (!b.nome || !b.descricao) {
    return NextResponse.json({ error: 'Campos obrigatórios: nome, descricao.' }, { status: 400 });
  }

  // Nível hierárquico do setor: sub-setor = nível do pai + 1; setor raiz = 2
  // (a vw_org_nodes usa esse valor como "level" — sem ele, sub-setores ficam
  // com o mesmo nível dos setores raiz e aparecem soltos na visão geral em vez
  // de aninhados dentro do setor-pai).
  let nivel = 2;
  if (b.parent_id) {
    try {
      const setores = await fetchAllPages<{ id: string; nivel: number | null }>('/setores', 'setores');
      const parent = setores.find(s => s.id === String(b.parent_id));
      nivel = (parent?.nivel ?? 2) + 1;
    } catch { nivel = 3; }
  }

  // 1. Cria o setor na API de RH
  let setorData: { id: string };
  try {
    setorData = await apiPost<{ id: string }>('/setores', {
      nome:         String(b.nome).trim(),
      descricao:    String(b.descricao).trim(),
      ativo:        b.ativo !== false,
      parent_id:    b.parent_id    || null,
      nivel,
      sigla:        b.sigla        ? String(b.sigla).trim().toUpperCase() : null,
      cor_setor:    b.cor_setor    || null,
      codigo_setor: b.codigo_setor ? String(b.codigo_setor).trim().toUpperCase() : null,
      id_origem:    b.id_origem    ?? null,
    });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao criar setor.');
    if (status === 409) return NextResponse.json({ error: 'Nome ou código já em uso.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }

  // 2. Determina o parent_id do nó no organograma:
  //    - Sub-setor: parent_id = UUID do setor-pai (o setor usa o próprio UUID como node id)
  //    - Setor raiz: parent_id = nó do Gerente Geral (cargo nvl 1)
  let parentNodeId: string | null = null;
  if (b.parent_id) {
    parentNodeId = String(b.parent_id);
  } else {
    try { parentNodeId = await findGmNodeId(); } catch { /* GM não encontrado: fica sem pai */ }
  }

  // 3. Cria o nó correspondente no organograma
  try {
    await apiPost('/organograma_nodes', {
      id:        setorData.id,
      id_ent:    setorData.id,
      parent_id: parentNodeId,
      is_sector: true,
    });
  } catch (e) {
    // Rollback: remove o setor recém-criado
    try { await apiDelete(`/setores/${setorData.id}`); } catch { /* best-effort */ }
    const { msg } = handleApiError(e);
    return NextResponse.json(
      { error: `Setor criado mas falha ao criar nó no organograma: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json(setorData, { status: 201 });
}
