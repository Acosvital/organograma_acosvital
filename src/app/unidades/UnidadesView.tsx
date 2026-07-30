'use client';

import { useCallback, useMemo } from 'react';
import GlobeExplorer from '@/components/Globe/GlobeExplorer';
import type { ClientPoint, ClientPointDetail } from '@/types/client';

interface ApiUnidade {
  id:            string;
  nome_fantasia: string;
  razao_social:  string;
  cidade:        string | null;
  estado:        string | null;
  latitude_y:    number | null;
  longitude_x:   number | null;
}

interface ApiUnidadeDetail extends ApiUnidade {
  cnpj:                string;
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
  cep:                 string | null;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function toPoint(u: ApiUnidade): ClientPoint {
  return {
    id:       hashCode(u.id),
    codigo:   u.id,
    nome:     u.nome_fantasia || u.razao_social,
    endereco: [u.cidade, u.estado].filter(Boolean).join(', '),
    lat:      Number(u.latitude_y),
    lon:      Number(u.longitude_x),
  };
}

interface Props {
  initialUnidades: ApiUnidade[];
}

export default function UnidadesView({ initialUnidades }: Props) {
  const points = useMemo(() => initialUnidades.map(toPoint), [initialUnidades]);

  const loadDetail = useCallback(async (p: ClientPoint): Promise<ClientPoint> => {
    if (!p.codigo) return p;
    try {
      const res = await fetch(`/api/unidades-mapa/${p.codigo}`);
      if (!res.ok) return p;
      const u = await res.json() as ApiUnidadeDetail;
      const detail: ClientPointDetail = {
        cnpj:                u.cnpj,
        razao_social:        u.razao_social,
        tipo_unidade:        u.tipo_unidade,
        nome_fantasia_matriz: u.nome_fantasia_matriz,
        nome_contato:        u.nome_contato,
        email:               u.email,
        telefone:            u.telefone,
        celular:             u.celular,
        homepage:            u.homepage,
        logradouro:          u.logradouro,
        numero:              u.numero,
        complemento:         u.complemento,
        bairro:              u.bairro,
        cep:                 u.cep,
      };
      return { ...p, detail };
    } catch {
      return p;
    }
  }, []);

  return (
    <GlobeExplorer
      points={points}
      theme="hub"
      loading={false}
      itemLabel={{ singular: 'unidade', plural: 'unidades' }}
      loadingText="Carregando unidades…"
      loadDetail={loadDetail}
    />
  );
}
