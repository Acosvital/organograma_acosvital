import { requireAuth } from '@/lib/apiAuth';
import { getUnidadesMapa } from '@/lib/data/unidadesMapa';
import UnidadesView from './UnidadesView';

export const dynamic = 'force-dynamic';

export default async function UnidadesPage() {
  const auth = await requireAuth();

  let unidades: Awaited<ReturnType<typeof getUnidadesMapa>>['unidades'] = [];
  if (!auth.err) {
    try {
      const result = await getUnidadesMapa();
      unidades = result.unidades;
    } catch {}
  }

  return <UnidadesView initialUnidades={unidades} />;
}
