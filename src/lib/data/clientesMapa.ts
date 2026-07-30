import { apiGet, extractArray } from '@/lib/apiClient';

interface ApiPage {
  clientes?: unknown[];
  total?:    number;
  page?:     number;
  pages?:    number;
  [k: string]: unknown;
}

const LIMIT = 100;

export interface ClientesMapaResult {
  clientes: unknown[];
  total:    number;
}

export async function getClientesMapa(filters: Record<string, string> = {}): Promise<ClientesMapaResult> {
  const firstPage = await apiGet<ApiPage>('/todos_os_clientes', {
    ...filters,
    page:  '1',
    limit: String(LIMIT),
  });

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

  return { clientes: all, total: Number(firstPage.total ?? all.length) };
}
