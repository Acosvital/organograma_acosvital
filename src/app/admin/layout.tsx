import { redirect } from 'next/navigation';
import { getMyRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getMyRole();
  if (role !== 'admin' && role !== 'editor') {
    redirect('/?erro=acesso-negado');
  }

  return <>{children}</>;
}
