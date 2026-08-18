import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { apiPut, handleApiError, HISTORIA_CACHE_TAG } from '@/lib/apiClient';
import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import { guard } from '@/lib/routeGuard';
import { parseJsonBody } from '@/lib/validation';
import { getHistoriaContent, toHistoriaContent, unwrap } from '@/lib/data/historia';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await guard(request, { role: 'viewer' });
  if (error) return error;

  try {
    return NextResponse.json(await getHistoriaContent());
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Não foi possível carregar o conteúdo.');
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body: parsed, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;
  const body = parsed as Record<string, unknown>;

  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : '';
  const texto  = typeof body.texto  === 'string' ? body.texto.trim()  : '';
  if (!titulo) {
    return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 });
  }

  const rawVideoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  if (rawVideoUrl && !toVideoEmbedUrl(rawVideoUrl)) {
    return NextResponse.json({ error: 'Link de vídeo inválido. Use um link do YouTube ou Vimeo.' }, { status: 400 });
  }

  // A API externa não tem um campo dedicado pra foto de fundo — reaproveita a
  // 1ª posição do array `imagens` (galeria antiga, removida da tela pública).
  const rawBgUrl = typeof body.backgroundImageUrl === 'string' ? body.backgroundImageUrl.trim() : '';
  const imagens = rawBgUrl ? [{ url: rawBgUrl, legenda: '' }] : [];

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
    revalidateTag(HISTORIA_CACHE_TAG, 'max');
    return NextResponse.json(toHistoriaContent(unwrap(raw)));
  } catch (e) {
    const { msg, status } = handleApiError(e, 'Não foi possível salvar as alterações.');
    return NextResponse.json({ error: msg }, { status });
  }
}
