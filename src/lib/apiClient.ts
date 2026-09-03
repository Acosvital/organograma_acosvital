/**
 * Cliente HTTP para a API REST externa da Açosvital.
 * Base URL e chave lidos das variáveis de ambiente server-side.
 */

const BASE = (process.env.API_ACOSVITAL_URL ?? 'https://api-test.acosvital.com.br').replace(/\/$/, '');
const KEY  =  process.env.API_ACOSVITAL_KEY  ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// Tag para as leituras de estrutura organizacional (cargos/setores/unidades/
// funcionários e a view agregada do organograma) — essas entidades são
// genuinamente interdependentes (o organograma e a listagem enriquecida de
// funcionários combinam as quatro), então uma escrita em qualquer uma
// legitimamente precisa invalidar as demais.
export const API_CACHE_TAG = 'acosvital-api';

// Tag separada para "Nossa História" — domínio independente da estrutura
// organizacional. Antes essas leituras usavam a mesma tag acima, então uma
// escrita em cargos/setores/unidades invalidava também o cache de história (e
// vice-versa) sem necessidade, forçando refetch de dados que não mudaram.
export const HISTORIA_CACHE_TAG = 'acosvital-historia';

// Tag para a tela de boas-vindas pós-login (welcome-settings/welcome-presets)
// — domínio independente, gerido fora deste app.
export const WELCOME_CACHE_TAG = 'acosvital-welcome';

async function request<T>(path: string, init: RequestInit = {}, cacheTag: string = API_CACHE_TAG): Promise<T> {
  const url = `${BASE}/${path.replace(/^\//, '')}`;
  const method = (init.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET' || method === 'HEAD';
  const res = await fetch(url, {
    ...init,
    headers: {
      'x-api-key':    KEY,
      'Accept':       'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    // GETs entram no Data Cache do Next por um TTL curto (a estrutura organizacional
    // muda pouco) e são invalidados sob demanda via revalidateTag(cacheTag) nas
    // rotas de escrita — evita refazer a busca completa da árvore a cada navegação.
    ...(isGet
      ? { next: { revalidate: 30, tags: [cacheTag] } }
      : { cache: 'no-store' as RequestCache }),
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json() as Record<string, unknown>;
      msg = String(j.message ?? j.error ?? msg);
    } catch { /* usar statusText */ }

    // Erros 5xx da API externa podem conter detalhes internos (schema, stack, etc.)
    // — loga o detalhe real no servidor mas nunca repassa ao cliente. Erros 4xx são
    // validações de negócio (ex. "CPF já cadastrado") que a UI depende para orientar o usuário.
    if (res.status >= 500) {
      console.error(`[apiClient] ${res.status} em ${path}:`, msg);
      throw new ApiError(res.status, 'Erro no serviço externo. Tente novamente em instantes.');
    }

    throw new ApiError(res.status, msg);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
  cacheTag?: string,
): Promise<T> {
  let p = path;
  if (params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) p += `?${qs}`;
  }
  return request<T>(p, {}, cacheTag);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: 'DELETE' });
}

/** Mapeia um ApiError para um status HTTP + mensagem amigável. */
export function handleApiError(e: unknown, fallback = 'Erro interno.'): { msg: string; status: number } {
  if (e instanceof ApiError) return { msg: e.message, status: e.status };
  return { msg: fallback, status: 500 };
}

/**
 * Normaliza a resposta da API para sempre retornar um array.
 * A API pode retornar um array puro ou um envelope { cargos: [...] },
 * { data: [...] }, { items: [...] }, etc.
 */
export function extractArray(raw: unknown, entityKey?: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Tenta a chave da entidade primeiro (ex: 'cargos', 'setores')
    if (entityKey && Array.isArray(obj[entityKey])) return obj[entityKey] as unknown[];
    // Fallback para chaves genéricas comuns
    for (const k of ['data', 'items', 'results', 'rows', 'records']) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
    // Última tentativa: primeira chave que seja array
    const firstArr = Object.values(obj).find(v => Array.isArray(v));
    if (firstArr) return firstArr as unknown[];
  }
  return [];
}

/**
 * Busca todas as páginas de um endpoint paginado e retorna o array completo.
 * Usa a 1ª página para descobrir o total de páginas e busca as demais em paralelo.
 */
export async function fetchAllPages<T = unknown>(
  path: string,
  entityKey: string,
  params: Record<string, string> = {},
  limit = 100,
): Promise<T[]> {
  const firstPage = await apiGet<Record<string, unknown>>(path, {
    ...params,
    page: '1',
    limit: String(limit),
  });
  const totalPages = Number(firstPage.totalPages ?? firstPage.pages ?? firstPage.total_pages ?? 1);
  let all = extractArray(firstPage, entityKey) as T[];

  if (totalPages > 1) {
    const rest = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        apiGet<Record<string, unknown>>(path, {
          ...params,
          page: String(i + 2),
          limit: String(limit),
        }).then(r => extractArray(r, entityKey) as T[]),
      ),
    );
    for (const r of rest) {
      if (r.status === 'fulfilled') all = [...all, ...r.value];
    }
  }
  return all;
}
