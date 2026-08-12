'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ApiCliente, ClientPoint } from '@/types/client';
import { toClientPoint } from '@/types/client';

const GlobeExplorer = dynamic(() => import('@/components/Globe/GlobeExplorer'), {
  ssr: false,
  loading: () => null,
});

function buildPoints(clientes: ApiCliente[]): ClientPoint[] {
  return clientes
    .filter(c => c.latitude_y != null && c.longitude_x != null)
    .map(c => toClientPoint(c, Number(c.latitude_y), Number(c.longitude_x)));
}

interface ClientesViewProps {
  canViewDetails?: boolean;
  initialClientes: ApiCliente[];
}

export default function ClientesView({ canViewDetails = false, initialClientes }: ClientesViewProps) {
  const points = useMemo(() => buildPoints(initialClientes), [initialClientes]);

  return (
    <GlobeExplorer
      points={points}
      theme="vital"
      loading={false}
      itemLabel={{ singular: 'cliente', plural: 'clientes' }}
      loadingText="Carregando clientes…"
      readOnly={!canViewDetails}
    />
  );
}
