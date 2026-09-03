import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { guard } from '@/lib/routeGuard';
import { parseJsonBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Registra a geolocalização best-effort capturada no momento do login (ver
 *  src/app/login/page.tsx) — mesmo comportamento que antes vivia dentro da
 *  Server Action de login, movido pra cá porque o login agora é client-side
 *  (NextAuth). Falha aqui nunca deve impedir o uso do app. */
export async function POST(request: NextRequest) {
  const { error, ctx } = await guard(request, { action: 'write', sameOrigin: true });
  if (error) return error;

  const { body, error: bodyErr } = await parseJsonBody(request);
  if (bodyErr) return bodyErr;

  const b = body as Record<string, unknown>;
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const logPath = path.join(process.cwd(), 'geo-log.json');
    const entry = { email: ctx?.email ?? null, lat, lon, at: new Date().toISOString() };
    const existing = fs.existsSync(logPath)
      ? JSON.parse(fs.readFileSync(logPath, 'utf-8'))
      : [];
    existing.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch {}

  return NextResponse.json({ ok: true });
}
