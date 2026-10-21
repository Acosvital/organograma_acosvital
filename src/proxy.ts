import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { DEV_AUTH_BYPASS } from '@/lib/devAuth';

export async function proxy(request: NextRequest) {
  // Bypass de desenvolvimento: libera todas as rotas sem verificação de auth.
  if (DEV_AUTH_BYPASS) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isPublic = pathname === '/login' || pathname.startsWith('/api/');

  // Sem NEXTAUTH_SECRET configurado: bloqueia e redireciona para /login
  if (!process.env.NEXTAUTH_SECRET) {
    if (!isPublic) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Só conta como autenticado quem tem `id_usuario` no token — é o mesmo critério
  // do requireAuth (src/lib/apiAuth.ts). O login pelo Azure busca esse id na API
  // com a chave; se a API estiver fora do ar ou a chave errada, o NextAuth ainda
  // emite um token válido, porém "oco" (sem id_usuario). Tratá-lo como logado aqui
  // fazia um loop infinito: a página rejeita (401) e manda pro /login, e este
  // proxy devolvia pra "/" por achar que a pessoa já estava autenticada.
  const authenticated = !!token?.id_usuario;

  // Não autenticado fora das rotas públicas → redireciona para /login
  if (!authenticated && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Autenticado tentando acessar /login → redireciona para home
  if (authenticated && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
