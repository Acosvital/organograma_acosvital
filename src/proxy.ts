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

  // Não autenticado fora das rotas públicas → redireciona para /login
  if (!token && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Autenticado tentando acessar /login → redireciona para home
  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
