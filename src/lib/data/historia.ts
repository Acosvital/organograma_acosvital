import { apiGet } from '@/lib/apiClient';
import type { HistoriaContent, HistoriaImagem, HistoriaTimelineItem } from '@/types/historia';

interface RawImagem { id: string; url: string; legenda: string | null }
interface RawTimelineItem { id: string; ano: number; titulo: string; descricao: string | null; imagem_url: string | null }
interface RawHistoria {
  titulo:      string;
  texto:       string;
  video_url:   string | null;
  updated_at:  string;
  imagens?:    RawImagem[];
  timeline?:   RawTimelineItem[];
}

/** API pode devolver o objeto direto ou envelopado em { historia: {...} }. */
export function unwrap(raw: unknown): RawHistoria {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return (obj.historia ?? obj) as RawHistoria;
}

export function toHistoriaContent(raw: RawHistoria): HistoriaContent {
  return {
    titulo:    raw.titulo,
    texto:     raw.texto,
    videoUrl:  raw.video_url,
    updatedAt: raw.updated_at,
    imagens: (raw.imagens ?? []).map((img): HistoriaImagem => ({
      id:      img.id,
      url:     img.url,
      legenda: img.legenda ?? '',
    })),
    timeline: (raw.timeline ?? []).map((item): HistoriaTimelineItem => ({
      id:        item.id,
      ano:       item.ano,
      titulo:    item.titulo,
      descricao: item.descricao ?? '',
      imagemUrl: item.imagem_url,
    })),
  };
}

export async function getHistoriaContent(): Promise<HistoriaContent> {
  const raw = await apiGet<unknown>('/historia');
  return toHistoriaContent(unwrap(raw));
}
