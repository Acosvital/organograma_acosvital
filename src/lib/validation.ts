import { NextResponse } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID (v1-v5) — usado para rejeitar IDs malformados antes de repassá-los à API externa. */
export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Teto padrão de corpo para mutações (100 KB) — cobre qualquer formulário real
 *  do app com folga e barra payloads abusivos. */
const MAX_BODY_BYTES = 100_000;

/**
 * Lê e valida o corpo JSON de uma mutação com limite de tamanho — defesa contra
 * DoS por payload gigante. Rejeita 413 (grande demais) ou 400 (JSON inválido)
 * ANTES de o handler tocar nos dados. Também centraliza o try/catch de parse que
 * era repetido em toda rota de escrita.
 */
export async function parseJsonBody(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<{ body: unknown; error: null } | { body: null; error: NextResponse }> {
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { body: null, error: NextResponse.json({ error: 'Corpo da requisição grande demais.' }, { status: 413 }) };
  }

  // Content-Length pode estar ausente/forjado — relê o texto e reconfere o
  // tamanho real antes de parsear.
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { body: null, error: NextResponse.json({ error: 'Não foi possível ler o corpo.' }, { status: 400 }) };
  }
  if (text.length > maxBytes) {
    return { body: null, error: NextResponse.json({ error: 'Corpo da requisição grande demais.' }, { status: 413 }) };
  }

  try {
    return { body: JSON.parse(text), error: null };
  } catch {
    return { body: null, error: NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) };
  }
}

/**
 * Regras de negócio do nível hierárquico de um cargo, compartilhadas entre
 * criação (POST) e edição (PUT). Retorna a mensagem de erro (422) ou null se ok.
 */
export function validateNvlPermissao(nvl: number): string | null {
  if (nvl === 2 || nvl === 3) return 'Níveis 2 e 3 são reservados para setores e sub-setores.';
  if (nvl > 12) return 'Nível hierárquico máximo permitido é 12.';
  return null;
}

/**
 * Checagem de mesma origem para mutações (POST/PUT/DELETE) — camada extra de defesa contra CSRF.
 * Compara o header Origin (ou Referer como fallback) contra o host da própria requisição.
 * Requisições sem nenhum dos dois headers (ex.: chamadas server-to-server internas) passam —
 * o risco real de CSRF vem de navegadores, que sempre enviam Origin em requisições cross-site.
 *
 * Atrás de um proxy reverso (nginx, Caddy, load balancer — o app roda em Docker,
 * ver Dockerfile/docker-compose.yml), `request.url` pode refletir o host interno
 * que o Next recebeu, não o domínio público que o navegador realmente visitou —
 * causando "Origem não permitida" em requisições legítimas. `x-forwarded-host` é
 * o que o proxy preenche com o domínio público original; mesma lógica de
 * confiança já usada para IP em rateLimit.ts (getClientIp).
 */
export function verifySameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return true;

  try {
    const originHost = new URL(origin).host;
    const forwardedHost = request.headers.get('x-forwarded-host');
    const requestHost = forwardedHost ? forwardedHost.split(',')[0].trim() : new URL(request.url).host;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export function forbiddenOrigin(): NextResponse {
  return NextResponse.json({ error: 'Origem da requisição não permitida.' }, { status: 403 });
}
