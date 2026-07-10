import type { Metadata } from 'next';
import HistoriaAdmin from './HistoriaAdmin';

export const metadata: Metadata = {
  title: 'História da Empresa — Açosvital',
};

export const dynamic = 'force-dynamic';

export default function AdminHistoriaPage() {
  return <HistoriaAdmin />;
}
