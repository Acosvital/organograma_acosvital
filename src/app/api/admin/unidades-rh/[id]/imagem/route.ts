import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/routeGuard';
import { isValidUUID, badRequest, parseJsonBody } from '@/lib/validation';
import { setUnidadeCardImage } from '@/lib/data/organogramaCards';

export const dynamic = 'force-dynamic';

// Define (ou limpa, com url: null) a imagem de empresa exibida no card desta
// unidade no organograma geral — independente do cadastro da unidade em si
// (API externa), guardada em src/lib/data/organogramaCards.ts.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidUUID(id)) return badRequest('ID inválido.');

  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const { url } = (body ?? {}) as { url?: unknown };
  if (url !== null && typeof url !== 'string') return badRequest('url inválida.');

  try {
    await setUnidadeCardImage(id, url || null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[unidades-rh/imagem] falha ao salvar configuração:', err);
    return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 502 });
  }
}
