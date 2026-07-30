import type { Metadata } from 'next';
import { requireAuth } from '@/lib/apiAuth';
import { getHistoriaContent } from '@/lib/data/historia';
import HistoriaView from './HistoriaView';

export const metadata: Metadata = {
  title: 'Nossa História — Açosvital',
};

export const dynamic = 'force-dynamic';

export default async function HistoriaPage() {
  const auth = await requireAuth('viewer');

  let historia: Awaited<ReturnType<typeof getHistoriaContent>> | null = null;
  let error = false;
  if (!auth.err) {
    try {
      historia = await getHistoriaContent();
    } catch {
      error = true;
    }
  }

  return <HistoriaView historia={historia} error={error} />;
}
