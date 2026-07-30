import type { Metadata } from 'next';
import { getHistoriaContent } from '@/lib/data/historia';
import HistoriaAdmin from './HistoriaAdmin';

export const metadata: Metadata = {
  title: 'História da Empresa — Açosvital',
};

export const dynamic = 'force-dynamic';

export default async function AdminHistoriaPage() {
  let historia: Awaited<ReturnType<typeof getHistoriaContent>> | null = null;
  try {
    historia = await getHistoriaContent();
  } catch {}

  return <HistoriaAdmin initialHistoria={historia} />;
}
