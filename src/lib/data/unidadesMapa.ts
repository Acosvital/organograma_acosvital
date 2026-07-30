import { fetchAllPages } from '@/lib/apiClient';

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

export interface UnidadesMapaResult {
  unidades: ApiUnidade[];
  total:    number;
}

export async function getUnidadesMapa(): Promise<UnidadesMapaResult> {
  const all = await fetchAllPages<ApiUnidade>('/mapa_unidades', 'unidades', {}, 50);
  const withCoords = all.filter(
    (u) =>
      u.latitude_y  != null && !isNaN(Number(u.latitude_y)) &&
      u.longitude_x != null && !isNaN(Number(u.longitude_x)),
  );
  return { unidades: withCoords, total: withCoords.length };
}
