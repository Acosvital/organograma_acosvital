import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/routeGuard';
import { isValidUUID, badRequest, parseJsonBody } from '@/lib/validation';
import { setUnidadeCardConfig } from '@/lib/data/organogramaCards';

export const dynamic = 'force-dynamic';

// Define (ou limpa, com cor: null) a cor do card desta unidade no organograma
// geral — independente do cadastro da unidade em si (API externa), guardada
// em src/lib/data/organogramaCards.ts.
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

  const { cor } = (body ?? {}) as { cor?: unknown };
  if (cor !== null && typeof cor !== 'string') return badRequest('cor inválida.');
  if (typeof cor === 'string' && !/^#[0-9a-f]{6}$/i.test(cor)) return badRequest('cor deve ser um hex #rrggbb.');

  try {
    await setUnidadeCardConfig(id, { color: cor || null });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[unidades-rh/cor] falha ao salvar configuração:', err);
    return NextResponse.json({ error: 'Falha ao salvar.' }, { status: 502 });
  }
}
