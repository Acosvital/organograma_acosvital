import NextAuth, { type AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { apiPost, apiGet, ApiError } from '@/lib/apiClient';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import type { MenuItem } from '@/lib/permissions';

interface MenuResponse {
  usuario: { id: string; email: string; username: string; photo_url: string | null };
  menu: MenuItem[];
}

async function fetchMenu(idUsuario: string): Promise<MenuResponse | null> {
  try {
    return await apiGet<MenuResponse>(`/permissoes_usuario/menu/${idUsuario}`);
  } catch {
    return null;
  }
}

async function findUserByEmail(email: string): Promise<string | null> {
  try {
    const data = await apiPost<{ id: string }>('/autenticacao/azure', { email });
    return data.id ?? null;
  } catch {
    return null;
  }
}

export const authOptions: AuthOptions = {
  providers: [
    AzureADProvider({
      clientId:     process.env.AZURE_AD_CLIENT_ID     ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId:     process.env.AZURE_AD_TENANT_ID      ?? '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Freio anti brute-force por IP (mesmo bucket/limite de antes, em
        // src/lib/rateLimit.ts) — best-effort: se não der pra extrair o IP
        // do request do NextAuth, segue sem bloquear o login.
        try {
          const ip = getClientIp(req?.headers as { get(name: string): string | null } ?? new Headers());
          const rl = rateLimit(ip, 'auth');
          if (!rl.ok) return null;
        } catch {}

        try {
          const data = await apiPost<{ id: string }>('/autenticacao/login', {
            email: credentials.email,
            senha: credentials.password,
          });
          return { id: data.id, email: credentials.email };
        } catch (e) {
          // Não repassa a mensagem crua do provedor — pode conter detalhes
          // internos. `null` faz o NextAuth devolver um erro genérico.
          if (!(e instanceof ApiError)) console.error('[auth] erro ao chamar /autenticacao/login:', e);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account?.provider === 'azure-ad') {
        token.authProvider = 'azure';
        const idUsuario = await findUserByEmail(token.email ?? '');
        if (idUsuario) {
          const userSession = await fetchMenu(idUsuario);
          token.id_usuario = idUsuario;
          token.menu = userSession?.menu ?? [];
        }
      }

      if (account?.provider === 'credentials' && user) {
        token.authProvider = 'credentials';
        token.id_usuario = user.id;
        const userSession = await fetchMenu(user.id);
        token.email = userSession?.usuario.email ?? token.email;
        token.menu = userSession?.menu ?? [];
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id_usuario   = token.id_usuario as string;
        session.user.authProvider = token.authProvider as 'azure' | 'credentials';
        session.user.menu         = token.menu ?? [];
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
