import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/apiClient';
import { requireAuth } from '@/lib/apiAuth';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';
import { isValidUUID, badRequest } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export interface ApiUnidadeDetail {
  id:                  string;
  cnpj:                string;
  razao_social:        string;
  nome_fantasia:       string;
  tipo_unidade:        'matriz' | 'filial';
  matriz_id:           string | null;
  nome_fantasia_matriz: string | null;
  nome_contato:        string;
  email:               string;
  telefone:            string | null;
  celular:             string | null;
  homepage:            string | null;
  logradouro:          string | null;
  numero:              string | null;
  complemento:         string | null;
  bairro:              string | null;
  cidade:              string | null;
  estado:              string | null;
  cep:                 string | null;
  latitude_y:          number | null;
  longitude_x:         number | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) return badRequest('ID inválido.');

  const { err } = await requireAuth('viewer');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  try {
    const data = await apiGet<ApiUnidadeDetail>(`/mapa_unidades/${id}`);
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar unidade.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
