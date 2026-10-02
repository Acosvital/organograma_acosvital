import { fetchAllPages } from '@/lib/apiClient';
import { EMPRESA_BUCKET } from '@/lib/s3Client';
import type { Unidade } from '@/types/adminCore';

const S3_BASE = (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '');

/**
 * Resolve `unidade.foto_url` (vindo da API) pra uma URL exibível no card.
 * O av-hub grava esse campo reaproveitando a key gerada pelo helper genérico
 * de upload de foto — no formato "/api/fotos/<key>", convenção do bucket
 * PRIVADO de pessoas dele. O bucket "empresa" (onde a foto de unidade
 * realmente fica) é público (ver comentário em s3Client.ts), então aqui a
 * URL final é direta pro S3, sem proxy de leitura autenticado.
 */
export function resolveFotoUrl(fotoUrl: string | null | undefined): string | undefined {
  if (!fotoUrl) return undefined;
  if (/^https?:\/\//i.test(fotoUrl)) return fotoUrl;
  const key = fotoUrl.replace(/^\/api\/fotos\//, '');
  return `${S3_BASE}/${EMPRESA_BUCKET}/${key}`;
}

/** Lista de unidades para a tela de seleção do organograma. */
export function getUnidadesList(): Promise<Unidade[]> {
  return fetchAllPages<Unidade>('/unidades', 'unidades');
}
