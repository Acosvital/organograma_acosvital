import { NextRequest, NextResponse } from 'next/server';
import { fetchAllPages } from '@/lib/apiClient';
import { requireAuth } from '@/lib/apiAuth';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

interface ApiUnidade {
  id:                  string;
  nome_fantasia:       string;
  razao_social:        string;
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

export async function GET(request: NextRequest) {
  const { err } = await requireAuth('viewer');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  try {
    const all = await fetchAllPages<ApiUnidade>('/mapa_unidades', 'unidades', {}, 50);
    const withCoords = all.filter(
      (u) =>
        u.latitude_y  != null && !isNaN(Number(u.latitude_y)) &&
        u.longitude_x != null && !isNaN(Number(u.longitude_x)),
    );
    return NextResponse.json({ unidades: withCoords, total: withCoords.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar unidades.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
