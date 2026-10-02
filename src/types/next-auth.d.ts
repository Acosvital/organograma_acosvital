import type { MenuItem } from '@/lib/permissions';

declare module 'next-auth' {
  interface Session {
    user: {
      id_usuario: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      authProvider: 'azure' | 'credentials';
      menu: MenuItem[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id_usuario?: string;
    authProvider?: 'azure' | 'credentials';
    menu?: MenuItem[];
  }
}
