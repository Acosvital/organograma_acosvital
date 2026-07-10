import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/apiAuth';
import { apiGet, apiPut, handleApiError } from '@/lib/apiClient';
import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit';
import { verifySameOrigin, forbiddenOrigin } from '@/lib/validation';
import type { HistoriaContent, HistoriaImagem, HistoriaTimelineItem } from '@/types/historia';

export const dynamic = 'force-dynamic';

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
function unwrap(raw: unknown): RawHistoria {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return (obj.historia ?? obj) as RawHistoria;
}

function toHistoriaContent(raw: RawHistoria): HistoriaContent {
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

export async function GET(request: NextRequest) {
  const { err } = await requireAuth('viewer');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'read');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  try {
    const raw = await apiGet<unknown>('/historia');
    return NextResponse.json(toHistoriaContent(unwrap(raw)));
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Não foi possível carregar o conteúdo.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: NextRequest) {
  if (!verifySameOrigin(request)) return forbiddenOrigin();

  const { err } = await requireAuth('editor');
  if (err) return err;

  const rl = rateLimit(getIp(request), 'write');
  if (!rl.ok) return rateLimitResponse(rl.retryAfterMs);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  const texto  = typeof body.texto  === 'string' ? body.texto.trim()  : '';
  if (!titulo) {
    return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 });
  }

  const rawVideoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (rawVideoUrl && !toVideoEmbedUrl(rawVideoUrl)) {
    return NextResponse.json({ error: 'Link de vídeo inválido. Use um link do YouTube ou Vimeo.' }, { status: 400 });
  }

  const imagensRaw = Array.isArray(body.imagens) ? body.imagens : [];
  const imagens = imagensRaw
    .filter((img): img is Record<string, unknown> => !!img && typeof img === 'object')
    .map(img => ({
      url:     typeof img.url === 'string' ? img.url.trim() : '',
      legenda: typeof img.legenda === 'string' ? img.legenda.trim() : '',
    }))
    .filter(img => img.url);

  const timelineRaw = Array.isArray(body.timeline) ? body.timeline : [];
  const timeline: { ano: number; titulo: string; descricao: string; imagem_url: string | null }[] = [];
  for (const item of timelineRaw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const ano = Number(t.ano);
    const itemTitulo = typeof t.titulo === 'string' ? t.titulo.trim() : '';
    if (!Number.isInteger(ano) || ano <= 1000 || ano >= 3000 || !itemTitulo) continue;
    timeline.push({
      ano,
      titulo:     itemTitulo,
      descricao:  typeof t.descricao === 'string' ? t.descricao.trim() : '',
      imagem_url: typeof t.imagemUrl === 'string' && t.imagemUrl.trim() ? t.imagemUrl.trim() : null,
    });
  }

  try {
    const raw = await apiPut<unknown>('/historia', {
      titulo,
      texto,
      video_url: rawVideoUrl || null,
      imagens,
      timeline,
    });
    return NextResponse.json(toHistoriaContent(unwrap(raw)));
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Não foi possível salvar as alterações.');
    return NextResponse.json({ error: msg }, { status });
  }
}
