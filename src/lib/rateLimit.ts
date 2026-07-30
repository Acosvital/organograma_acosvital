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

// IMPORTANTE: o teto de `read` precisa comportar UM carregamento inteiro de tela.
// O organograma é montado por BFS lazy que dispara um GET /api/org?parent_id=<id>
// por nó (~300 nós hoje). Sem proxy reverso, getIp() cai em 'unknown' e o balde
// vira global — então um teto baixo (o antigo 60/min) fazia a árvore parar de
// carregar no ~60º nó (429) e o sistema "não trazer dados". 1000/min dá folga
// para alguns carregamentos/trocas de unidade por minuto e ainda barra scraping
// abusivo (>~16 req/s). Escrita e auth seguem estritas — são o vetor real de abuso.
const LIMITS = {
  read:  { max: 1000, windowMs: 60_000 },
  write: { max: 20,   windowMs: 60_000 },
  auth:  { max: 10,   windowMs: 60_000 },
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
// Aceita tanto Headers (rotas) quanto o ReadonlyHeaders de next/headers (server
// actions) — ambos expõem .get(). Evita duplicar a extração de IP no login.
export function getClientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return 'unknown';
}

export function getIp(request: Request): string {
  return getClientIp(request.headers);
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
