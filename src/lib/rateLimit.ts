import { NextResponse } from 'next/server';

interface RateLimitWindow {
  count: number;
  reset: number;
}

const store = new Map<string, RateLimitWindow>();

// Limpeza de entradas expiradas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of store) {
    if (now > w.reset) store.delete(key);
  }
}, 5 * 60_000);

const LIMITS = {
  read:  { max: 60,  windowMs: 60_000 },
  write: { max: 20,  windowMs: 60_000 },
  auth:  { max: 10,  windowMs: 60_000 },
};

export type LimitAction = keyof typeof LIMITS;

export function rateLimit(
  ip: string,
  action: LimitAction,
): { ok: boolean; retryAfterMs: number } {
  const { max, windowMs } = LIMITS[action];
  const key = `${ip}:${action}`;
  const now = Date.now();

  let w: RateLimitWindow | undefined = store.get(key);
  if (!w || now > w.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  if (w.count >= max) {
    return { ok: false, retryAfterMs: w.reset - now };
  }

  w.count++;
  return { ok: true, retryAfterMs: 0 };
}

// Sem um proxy reverso confiável configurado na frente da app, nenhum header de IP é
// 100% imune a forjamento pelo próprio cliente — isso é uma limitação de infraestrutura,
// não só de código. `x-real-ip` é preferido por carregar um único valor (setado pelo
// proxy mais próximo, ex. Vercel/nginx), mais difícil de manipular em cadeia do que
// `x-forwarded-for`, que o cliente pode preencher com múltiplos valores falsos.
export function getIp(request: Request): string {
  const headers = request.headers as Headers;
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

export function rateLimitResponse(retryAfterMs: number) {
  return NextResponse.json(
    { error: 'Muitas requisições. Aguarde antes de tentar novamente.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    },
  );
}
