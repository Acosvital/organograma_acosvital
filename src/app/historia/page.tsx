import type { Metadata } from 'next';
import HistoriaView from './HistoriaView';

export const metadata: Metadata = {
  title: 'Nossa História — Açosvital',
};

export const dynamic = 'force-dynamic';

export default function HistoriaPage() {
  return <HistoriaView />;
}
