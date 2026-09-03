import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/** Sessão NextAuth atual (Server Components / Route Handlers). */
export function auth() {
  return getServerSession(authOptions);
}
