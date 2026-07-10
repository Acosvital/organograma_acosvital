import { NextResponse } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID (v1-v5) — usado para rejeitar IDs malformados antes de repassá-los à API externa. */
export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Checagem de mesma origem para mutações (POST/PUT/DELETE) — camada extra de defesa contra CSRF.
 * Compara o header Origin (ou Referer como fallback) contra o host da própria requisição.
 * Requisições sem nenhum dos dois headers (ex.: chamadas server-to-server internas) passam —
 * o risco real de CSRF vem de navegadores, que sempre enviam Origin em requisições cross-site.
 */
export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const requestHost = new URL(request.url).host;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export function forbiddenOrigin(): NextResponse {
  return NextResponse.json({ error: 'Origem da requisição não permitida.' }, { status: 403 });
}
