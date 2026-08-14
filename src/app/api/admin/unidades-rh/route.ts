import { NextRequest, NextResponse } from 'next/server';
import { apiPost, handleApiError } from '@/lib/apiClient';
import { guard } from '@/lib/routeGuard';
import { parseJsonBody } from '@/lib/validation';
import { getUnidadesList } from '@/lib/data/unidades';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor' });
  if (error) return error;

  try {
    const unidades = await getUnidadesList();
    return NextResponse.json(unidades);
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao buscar unidades.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;

  const required = ['cnpj', 'razao_social', 'nome_fantasia', 'tipo_unidade',
                    'nome_contato', 'email', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep'];
  const missing = required.filter(k => !b[k]);
  if (missing.length) {
    return NextResponse.json({ error: `Campos obrigatórios: ${missing.join(', ')}.` }, { status: 400 });
  }

  if (b.tipo_unidade === 'filial' && !b.matriz_id) {
    return NextResponse.json({ error: 'Filial requer matriz_id.' }, { status: 422 });
  }

  const cnpj = String(b.cnpj).replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const cep  = String(b.cep).replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');

  try {
    const data = await apiPost('/unidades', {
      cnpj,
      razao_social:  String(b.razao_social).trim(),
      nome_fantasia: String(b.nome_fantasia).trim(),
      tipo_unidade:  b.tipo_unidade,
      matriz_id:     b.matriz_id     || null,
      nome_contato:  String(b.nome_contato).trim(),
      email:         String(b.email).trim().toLowerCase(),
      telefone:      b.telefone      || null,
      celular:       b.celular       || null,
      homepage:      b.homepage      || null,
      logradouro:    String(b.logradouro).trim(),
      numero:        String(b.numero).trim(),
      complemento:   b.complemento   || null,
      bairro:        String(b.bairro).trim(),
      cidade:        String(b.cidade).trim(),
      estado:        String(b.estado).trim().toUpperCase(),
      cep,
      latitude_y:    b.latitude_y  != null ? Number(b.latitude_y)  : null,
      longitude_x:   b.longitude_x != null ? Number(b.longitude_x) : null,
      ordem_exibicao: b.ordem_exibicao != null && b.ordem_exibicao !== '' ? Number(b.ordem_exibicao) : null,
      id_origem:     b.id_origem     ?? null,
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Erro ao criar unidade.');
    if (status === 409) return NextResponse.json({ error: 'CNPJ ou nome fantasia já cadastrado.' }, { status: 409 });
    return NextResponse.json({ error: msg }, { status });
  }
}
