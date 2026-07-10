import { NextResponse } from 'next/server';
import { createClient } from './supabase/server';
import { DEV_AUTH_BYPASS } from './devAuth';

export type Role = 'admin' | 'editor' | 'viewer';

export interface AuthCtx {
  userId: string;
  role:   Role;
}

type SB = Awaited<ReturnType<typeof createClient>>;

type Ok  = { ctx: AuthCtx; supabase: SB;  err: null };
type Err = { ctx: null;    supabase: null; err: NextResponse };

/**
 * Verifica sessão + role mínima requerida.
 * Retorna { ctx, supabase } se autorizado, ou { err } com resposta HTTP pronta.
 * O cliente Supabase retornado pode ser reutilizado nas operações de dados.
 */
export async function requireAuth(minRole: Role = 'viewer'): Promise<Ok | Err> {
  // Bypass de desenvolvimento: assume papel de admin sem sessão real, para que
  // as telas internas (incl. editor admin) sejam inspecionáveis. Sem efeito em
  // produção — veja `devAuth.ts`. Escritas ainda respeitam o RLS do banco.
  if (DEV_AUTH_BYPASS) {
    try {
      const supabase = await createClient();
      return { ctx: { userId: 'dev-bypass', role: 'admin' }, supabase, err: null };
    } catch {
      return errResponse(503, 'Serviço temporariamente indisponível.');
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return errResponse(503, 'Serviço temporariamente indisponível.');
  }

  let supabase: SB;
  try {
    supabase = await createClient();
  } catch {
    return errResponse(503, 'Serviço temporariamente indisponível.');
  }

  // getUser()/rpc() falam com o Supabase pela rede — uma instabilidade transitória
  // aqui não pode virar um crash não tratado (500 genérico do Next.js); vira uma
  // resposta JSON limpa para o front-end mostrar um toast normal.
  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return errResponse(401, 'Não autenticado.');
    }

    const { data: role, error: roleErr } = await supabase.rpc('get_my_role');
    if (roleErr || !role) {
      return errResponse(403, 'Acesso negado. Usuário sem permissão cadastrada.');
    }

    const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };
    const userRank = ROLE_RANK[role as Role] ?? 0;
    if (userRank < ROLE_RANK[minRole]) {
      return errResponse(403, 'Permissão insuficiente.');
    }

    return { ctx: { userId: user.id, role: role as Role }, supabase, err: null };
  } catch {
    return errResponse(503, 'Não foi possível verificar sua sessão. Tente novamente.');
  }
}

function errResponse(status: number, message: string): Err {
  return {
    ctx:      null,
    supabase: null,
    err:      NextResponse.json({ error: message }, { status }),
  };
}
