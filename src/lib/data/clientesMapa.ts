import { apiGet, extractArray } from '@/lib/apiClient';

interface ApiPage {
  clientes?: unknown[];
  total?:    number;
  page?:     number;
  pages?:    number;
  [k: string]: unknown;
}

const LIMIT = 100;

// ── Quem aparece: a mesma regra do Hub (Acompanhamento de Clientes) ──
// A lista com endereço/coordenadas (/todos_os_clientes) traz TODO cadastro,
// inclusive quem nunca comprou. O Hub decide isso em /acompanhamento_clientes,
// onde cada CNPJ tem um `status`: ativo, inativo, coberto_grupo ou sem_compra
// (cadastrado que nunca teve pedido nem nota). Aqui só entra quem tem status
// diferente de sem_compra; a lista com endereço continua sendo a fonte das
// coordenadas. Cruzamento por `codigo_cliente` = `codigo_parceiro_omie`.
const STATUS_COM_COMPRA = ['ativo', 'inativo', 'coberto_grupo'] as const;
// Cada linha carrega a composição do mês (~6 KB). Com 500 por página a resposta passa de
// 2 MB e o cache de fetch do Next recusa (avisa no log a cada chamada); 200 fica abaixo.
const ACOMP_LIMIT = 200;
// A base de compras muda devagar e cada página é pesada (a API manda a composição
// do mês de cada cliente) — guarda só os códigos, por alguns minutos.
const COMPRAS_TTL_MS = 10 * 60_000;

interface AcompRow { codigo_cliente?: string | number | null }

async function codigosDoStatus(status: string): Promise<string[]> {
  const first = await apiGet<Record<string, unknown>>('/acompanhamento_clientes', {
    status, page: '1', limit: String(ACOMP_LIMIT),
  });
  const pages = Number(first.totalPages ?? first.pages ?? 1);
  let rows = extractArray(first, 'data') as AcompRow[];
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        apiGet<Record<string, unknown>>('/acompanhamento_clientes', {
          status, page: String(i + 2), limit: String(ACOMP_LIMIT),
        }).then((r) => extractArray(r, 'data') as AcompRow[]),
      ),
    );
    for (const r of rest) rows = rows.concat(r);
  }
  return rows.map((r) => String(r.codigo_cliente ?? '')).filter(Boolean);
}

let comprasCache: { at: number; promise: Promise<Set<string>> } | null = null;

/** Códigos de cliente que têm compra (qualquer status exceto sem_compra). Falha não fica em cache. */
export function getCodigosComCompra(): Promise<Set<string>> {
  if (comprasCache && Date.now() - comprasCache.at < COMPRAS_TTL_MS) return comprasCache.promise;
  const promise = Promise.all(STATUS_COM_COMPRA.map(codigosDoStatus)).then(
    (listas) => new Set(listas.flat()),
  );
  comprasCache = { at: Date.now(), promise };
  promise.catch(() => { comprasCache = null; });
  return promise;
}

export interface ClientesMapaResult {
  clientes: unknown[];
  total:    number;
}

export async function getClientesMapa(filters: Record<string, string> = {}): Promise<ClientesMapaResult> {
  const [firstPage, comCompra] = await Promise.all([
    apiGet<ApiPage>('/todos_os_clientes', {
      ...filters,
      page:  '1',
      limit: String(LIMIT),
    }),
    getCodigosComCompra(),
  ]);

  const totalPages = Number(firstPage.totalPages ?? firstPage.pages ?? 1);
  let all = extractArray(firstPage, 'clientes');

  if (totalPages > 1) {
    const pages = await Promise.allSettled(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        apiGet<ApiPage>('/todos_os_clientes', {
          ...filters,
          page:  String(i + 2),
          limit: String(LIMIT),
        }).then(r => extractArray(r, 'clientes')),
      ),
    );
    for (const r of pages) {
      if (r.status === 'fulfilled') all = [...all, ...r.value];
    }
  }

  // Sem compra não aparece (mesma regra do Hub). O total é o dos que aparecem.
  const clientes = all.filter((c) => comCompra.has(String((c as { codigo_parceiro_omie?: unknown }).codigo_parceiro_omie ?? '')));
  return { clientes, total: clientes.length };
}
