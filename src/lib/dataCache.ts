/**
 * Cache de dados client-side — persiste entre remontagens de componentes dentro
 * da mesma sessão de navegação (módulo vive enquanto a aba estiver aberta).
 *
 * Recursos:
 *  - TTL configurável por chave
 *  - Deduplicação de requisições em voo (duas montagens simultâneas geram 1 fetch)
 *  - Invalidação manual após mutações
 *  - isCacheHit() para evitar spinner desnecessário em cache quente
 */

interface CacheEntry<T> {
  data: T;
  ts:   number;
}

const store   = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// ── Constantes de TTL ────────────────────────────────────────────────────────

export const CACHE_TTL = {
  ORG:   5  * 60 * 1000,  // 5 min — organograma (admin pode alterar)
  ADMIN:  3 * 60 * 1000,  // 3 min — listas do painel admin
} as const;

export const CACHE_KEYS = {
  ORG:           'org',
  ADMIN_CARGOS:  'admin-cargos',
  ADMIN_SETORES: 'admin-setores',
  ADMIN_UNITS:   'admin-unidades-rh',
  ADMIN_FUNCS:   'admin-funcionarios',
} as const;

/** Chave de cache do organograma de uma unidade específica. */
export function orgCacheKey(unidadeId: string): string {
  return `org:${unidadeId}`;
}

// ── API pública ──────────────────────────────────────────────────────────────

/** Retorna true se a entrada existir e ainda estiver dentro do TTL. */
export function isCacheHit(key: string, ttlMs: number): boolean {
  const e = store.get(key);
  return !!e && Date.now() - e.ts < ttlMs;
}

/** Remove entradas do cache (force-refresh na próxima leitura). */
export function invalidateCache(...keys: string[]): void {
  for (const k of keys) store.delete(k);
}

/** Remove todas as entradas cujo chave começa com o prefixo dado — usado para
 *  invalidar o organograma de todas as unidades de uma vez (chaves `org:<id>`). */
export function invalidateCachePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/**
 * Busca com cache: retorna dado em cache se fresco, senão faz fetch.
 * Requisições concorrentes para a mesma chave são deduplicas — apenas 1 vai à rede.
 */
export async function cachedFetch<T>(
  key:    string,
  fetcher: () => Promise<T>,
  ttlMs:  number,
): Promise<T> {
  // Cache hit
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;

  // Deduplicar requisição em andamento
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p: Promise<T> = fetcher()
    .then(data => {
      store.set(key, { data, ts: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch(err => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, p);
  return p;
}
