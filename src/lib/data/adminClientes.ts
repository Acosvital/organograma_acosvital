import { apiGet, extractArray } from '@/lib/apiClient';

export interface AdminClientesResult {
  clientes: unknown[];
  total:    number;
  page:     number;
  pages:    number;
}

export async function getClientesAdminPage(
  { q = '', page = 1, limit = 50 }: { q?: string; page?: number; limit?: number } = {},
): Promise<AdminClientesResult> {
  const raw = await apiGet<Record<string, unknown>>('/todos_os_clientes', {
    q, page: String(page), limit: String(limit),
  });

  const clientes = extractArray(raw, 'clientes');
  const meta     = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};

  return {
    clientes,
    total: Number(meta.total ?? clientes.length),
    page:  Number(meta.page  ?? page),
    pages: Number(meta.totalPages ?? meta.pages ?? 1),
  };
}
