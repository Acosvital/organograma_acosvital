import { blogGet, HISTORIA_CACHE_TAG } from '@/lib/apiClient';
import type { HistoriaContent, HistoriaTimelineItem } from '@/types/historia';

// A API respondeu em camelCase direto (sem envelope, sem array `imagens` —
// `backgroundImageUrl` é campo próprio agora), diferente do contrato antigo
// em snake_case com `imagens[0].url` como foto de fundo. Aceita as duas
// grafias por segurança até o shape se manter estável em produção.
interface RawImagem { url: string }
interface RawTimelineItem {
  id:         string;
  ano:        number;
  titulo:     string;
  descricao?: string | null;
  imagemUrl?:  string | null;
  imagem_url?: string | null;
}
interface RawHistoria {
  titulo:  string;
  texto:   string;
  videoUrl?:  string | null;
  video_url?: string | null;
  backgroundImageUrl?: string | null;
  imagens?:            RawImagem[];
  updatedAt?:  string;
  updated_at?: string;
  timeline?: RawTimelineItem[];
}

/** API pode devolver o objeto direto ou envelopado em { historia: {...} }. */
export function unwrap(raw: unknown): RawHistoria {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return (obj.historia ?? obj) as RawHistoria;
}

export function toHistoriaContent(raw: RawHistoria): HistoriaContent {
  return {
    titulo:              raw.titulo,
    texto:               raw.texto,
    videoUrl:            raw.videoUrl ?? raw.video_url ?? null,
    updatedAt:           raw.updatedAt ?? raw.updated_at ?? new Date(0).toISOString(),
    backgroundImageUrl:  raw.backgroundImageUrl ?? raw.imagens?.[0]?.url ?? null,
    timeline: (raw.timeline ?? []).map((item): HistoriaTimelineItem => ({
      id:        item.id,
      ano:       item.ano,
      titulo:    item.titulo,
      descricao: item.descricao ?? '',
      imagemUrl: item.imagemUrl ?? item.imagem_url ?? null,
    })),
  };
}

export async function getHistoriaContent(): Promise<HistoriaContent> {
  const raw = await blogGet<unknown>('/api/historia', undefined, HISTORIA_CACHE_TAG);
  return toHistoriaContent(unwrap(raw));
}
