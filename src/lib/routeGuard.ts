import type { NextResponse } from 'next/server';
import { requireAuth, type AuthCtx } from './apiAuth';
import { rateLimit, getIp, rateLimitResponse, type LimitAction } from './rateLimit';
import { verifySameOrigin, forbiddenOrigin } from './validation';

interface GuardOptions {
  /** Bucket de rate limit. Padrão: 'read'. Use 'write' em mutações. */
  action?: LimitAction;
  /** Exige mesma origem (defesa CSRF). Ligue em POST/PUT/DELETE. Padrão: false. */
  sameOrigin?: boolean;
}

type GuardResult =
  | { error: NextResponse; ctx: null }
  | { error: null; ctx: AuthCtx };

/**
 * Portão único de entrada das rotas de API: concentra as três checagens que
 * antes eram copiadas (e divergiam) em cada handler — origem (CSRF), rate limit
 * e autenticação — numa ordem fixa e defensiva:
 *
 *   1. Mesma origem  — rejeita cross-site antes de qualquer trabalho (mutações).
 *   2. Rate limit    — barra abuso por IP ANTES de pagar o custo de rede da
 *                      verificação de sessão (NextAuth).
 *   3. Auth          — só então valida a sessão.
 *
 * Uso:
 *   const { error } = await guard(request);
 *   if (error) return error;
 */
export async function guard(
  request: Request,
  { action = 'read', sameOrigin = false }: GuardOptions = {},
): Promise<GuardResult> {
  if (sameOrigin && !verifySameOrigin(request)) {
    return { error: forbiddenOrigin(), ctx: null };
  }

  const rl = rateLimit(getIp(request), action);
  if (!rl.ok) return { error: rateLimitResponse(rl.retryAfterMs), ctx: null };

  const { ctx, err } = await requireAuth();
  if (err) return { error: err, ctx: null };

  return { error: null, ctx };
}
