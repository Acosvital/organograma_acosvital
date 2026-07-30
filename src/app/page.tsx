import { requireAuth } from '@/lib/apiAuth';
import { getUnidadesList } from '@/lib/data/unidades';
import UnidadeSelectorView from './UnidadeSelectorView';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const auth = await requireAuth('viewer');

  let unidades: Awaited<ReturnType<typeof getUnidadesList>> = [];
  let error = false;
  if (!auth.err) {
    try {
      unidades = await getUnidadesList();
    } catch {
      error = true;
    }
  }

  return <UnidadeSelectorView unidades={unidades} error={error} />;
}
