import { NextResponse } from 'next/server';
import { auth } from './session';
import { hasPermission } from './permissions';
import { DEV_AUTH_BYPASS } from './devAuth';

export interface AuthCtx {
  userId: string;
  email?: string | null;
}

type Ok  = { ctx: AuthCtx; err: null };
type Err = { ctx: null;    err: NextResponse };

/**
 * Verifica que existe uma sessão NextAuth válida.
 * Retorna { ctx } se autorizado, ou { err } com resposta HTTP pronta.
 */
export async function requireAuth(): Promise<Ok | Err> {
  if (DEV_AUTH_BYPASS) {
    return { ctx: { userId: 'dev-bypass', email: 'dev@local' }, err: null };
  }

  try {
    const session = await auth();
    if (!session?.user?.id_usuario) {
      return { ctx: null, err: errResponse(401, 'Não autenticado.') };
    }
    return { ctx: { userId: session.user.id_usuario, email: session.user.email }, err: null };
  } catch {
    return { ctx: null, err: errResponse(503, 'Não foi possível verificar sua sessão. Tente novamente.') };
  }
}

/**
 * O organograma é somente leitura — a única distinção de acesso que resta é
 * na tela de Clientes: quantidade, distribuição por região e os pontos no
 * mapa aparecem pra qualquer autenticado; sem essa permissão, some só a
 * lista de nomes embaixo e o painel de detalhe (ver `src/app/clientes/page.tsx`).
 * Checado via a mesma árvore de permissões por tela
 * (`/permissoes_usuario/menu/:id`) usada no Aços Hub, na tela
 * `organograma-clientes` (ver docs do contrato).
 */
export async function canViewClientes(): Promise<boolean> {
  if (DEV_AUTH_BYPASS) return true;
  try {
    const session = await auth();
    return hasPermission(session?.user?.menu ?? [], 'organograma-clientes', 'pode_visualizar');
  } catch {
    return false;
  }
}

function errResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
