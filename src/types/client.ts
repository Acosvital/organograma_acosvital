/** Shape retornado pela API externa (/todos_os_clientes) */
export interface ApiCliente {
  codigo_parceiro_omie: string;
  nome_fantasia:        string;
  email:                string | null;
  telefone:             string | null;
  logradouro:           string | null;
  numero:               string | null;
  complemento:          string | null;
  bairro:               string | null;
  cidade:               string | null;
  estado:               string | null;
  cep:                  string | null;
  latitude_y:           number | null;
  longitude_x:          number | null;
}

/** Campos extras carregados sob demanda ao selecionar uma unidade. */
export interface ClientPointDetail {
  cnpj?:               string;
  razao_social?:       string;
  tipo_unidade?:       'matriz' | 'filial';
  nome_fantasia_matriz?: string | null;
  nome_contato?:       string;
  email?:              string;
  telefone?:           string | null;
  celular?:            string | null;
  homepage?:           string | null;
  logradouro?:         string | null;
  numero?:             string | null;
  complemento?:        string | null;
  bairro?:             string | null;
  cep?:                string | null;
}

/** Ponto enriquecido usado internamente pelo globo de clientes */
export interface ClientPoint {
  id:        number;
  /** Identificador string (novo formato) */
  codigo?:   string;
  nome:      string;
  /** "Cidade, UF" — necessário para regionFromAddress */
  endereco:  string;
  lat:       number;
  lon:       number;
  /** Campos detalhados carregados sob demanda (apenas unidades). */
  detail?:   ClientPointDetail;
  /** Disponíveis desde a carga inicial (sem esperar `detail`) para o globo poder
   *  priorizar o rótulo da matriz e desenhar a linha matriz→filial de cara. */
  tipoUnidade?: 'matriz' | 'filial';
  matrizId?:    string | null;
  // ── Campos legados (usado por Unidades / GlobeSidebar) ──────────────────
  /** @deprecated use codigo */
  codigo_omie?: number;
  /** @deprecated */
  source?:      'file' | 'manual';
}

/** Constrói a query de geocodificação a partir dos campos de endereço */
export function buildGeoQuery(c: ApiCliente): string | null {
  if (!c.cidade && !c.estado) return null;
  const parts: string[] = [];
  if (c.logradouro) {
    parts.push(c.logradouro);
    if (c.numero) parts.push(c.numero);
  }
  if (c.bairro) parts.push(c.bairro);
  if (c.cidade)  parts.push(c.cidade);
  if (c.estado)  parts.push(c.estado);
  parts.push('Brasil');
  return parts.join(', ');
}

/** "São Paulo, SP" — exibição e detecção de região */
export function buildEndereco(c: ApiCliente): string {
  return [c.cidade, c.estado].filter(Boolean).join(', ');
}

/** Converte ApiCliente + coord para ClientPoint */
export function toClientPoint(c: ApiCliente, lat: number, lon: number): ClientPoint {
  return {
    id:       parseInt(c.codigo_parceiro_omie, 10) || hashCode(c.codigo_parceiro_omie),
    codigo:   c.codigo_parceiro_omie,
    nome:     c.nome_fantasia,
    endereco: buildEndereco(c),
    lat,
    lon,
  };
}

/** Converte ClientPoint para o shape mínimo que o GlobeCanvas aceita */
export function toGlobePoint(c: ClientPoint) {
  return {
    id:        c.id,
    lat:       c.lat,
    lon:       c.lon,
    label:     c.nome,
    isMatriz:  c.tipoUnidade === 'matriz',
    matrizId:  c.matrizId ? hashCode(c.matrizId) : null,
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Tipos legados mantidos para compatibilidade com ClientesAdmin ─────────────
/** @deprecated use ApiCliente */
export interface OmieClient {
  codigo_omie: number;
  nome:        string;
  endereco:    string;
  latitude:    number;
  longitude:   number;
}
/** @deprecated */
export function fromOmie(c: OmieClient): ClientPoint {
  return {
    id:       c.codigo_omie,
    codigo:   String(c.codigo_omie),
    nome:     c.nome,
    endereco: c.endereco,
    lat:      c.latitude,
    lon:      c.longitude,
  };
}
