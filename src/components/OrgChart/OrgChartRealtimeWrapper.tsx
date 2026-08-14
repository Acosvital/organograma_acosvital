'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  calculateOverviewLayout, calculateConnections,
  OVERVIEW_RING_RADII, OVERVIEW_NODE_RADIUS,
} from '@/utils/radialLayout';
import type { OrgNode } from '@/types/orgChart';
import { cachedFetch, isCacheHit, orgCacheKey, CACHE_TTL } from '@/lib/dataCache';

const OrgChart = dynamic(() => import('@/components/OrgChart/OrgChart'), {
  ssr: false,
  loading: () => null,
});

const emptyStateStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  textAlign: 'center',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  color: 'rgba(255,255,255,0.55)',
  pointerEvents: 'none',
};

const syncDotStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 40,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: 'rgba(8, 14, 40, 0.88)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 20,
  padding: '5px 12px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.55)',
  letterSpacing: '0.04em',
  backdropFilter: 'blur(10px)',
  pointerEvents: 'none',
};

interface Props {
  /** Unidade cujo organograma deve ser exibido — só a Diretoria (nível 0)
   *  sempre aparece (papel global); Gerência Geral, setores e demais pessoas
   *  são filtrados por esta unidade. */
  unidadeId: string;
  initialNodes?: OrgNode[];
  levelColors: Record<number, string>;
  levelNames: Record<number, string>;
}

export default function OrgChartRealtimeWrapper({ unidadeId, initialNodes = [], levelColors, levelNames }: Props) {
  const [nodes, setNodes]         = useState<OrgNode[]>(initialNodes);
  const [isSyncing, setIsSyncing] = useState(false);
  const [triedFetch, setTriedFetch] = useState(initialNodes.length > 0);

  const overviewNodes = useMemo(
    () => nodes.filter((n) =>
      n.level <= 2 && (n.isSector || n.level === 0 || n.unidadeId === unidadeId),
    ),
    [nodes, unidadeId],
  );
  const positions = useMemo(
    // Distribute each level evenly across the full 360°, independent of tree structure.
    // Sectors spread around the full sector ring; orphaned nodes land on their correct ring by level.
    () => calculateOverviewLayout(overviewNodes, OVERVIEW_RING_RADII, OVERVIEW_NODE_RADIUS),
    [overviewNodes],
  );
  const connections = useMemo(() => calculateConnections(positions), [positions]);

  // Busca dados frescos ao montar (ou trocar de unidade) — usa cache se < 5 min
  // (evita refetch em toda navegação). Cache é isolado por unidade.
  useEffect(() => {
    let active = true;
    const key = orgCacheKey(unidadeId);
    const ttl = CACHE_TTL.ORG;

    setNodes([]);
    if (!isCacheHit(key, ttl)) setIsSyncing(true);

    cachedFetch<OrgNode[]>(
      key,
      () => fetch(`/api/org?unidade_id=${encodeURIComponent(unidadeId)}`).then(r => r.json()),
      ttl,
    )
      .then(data => { if (active && Array.isArray(data)) setNodes(data); })
      .catch(() => {})
      .finally(() => { if (active) { setIsSyncing(false); setTriedFetch(true); } });

    return () => { active = false; };
  }, [unidadeId]);

  return (
    <>
      <OrgChart
        positions={positions}
        connections={connections}
        allNodes={nodes}
        levelColors={levelColors}
        levelNames={levelNames}
        unidadeId={unidadeId}
      />
      {!isSyncing && triedFetch && nodes.length === 0 && (
        <div style={emptyStateStyle}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Organograma indisponível</span>
          <span style={{ fontSize: 12.5, opacity: 0.85, maxWidth: 320 }}>
            Não foi possível carregar os dados desta unidade. Verifique a conexão com a API ou tente novamente mais tarde.
          </span>
        </div>
      )}
      {isSyncing && (
        <div style={syncDotStyle}>
          <svg width="8" height="8" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="3" fill="#60a5fa">
              <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
          Sincronizando…
        </div>
      )}
    </>
  );
}
