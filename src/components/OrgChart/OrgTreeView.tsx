'use client';

import { useMemo, useState } from 'react';
import type { OrgNode } from '@/types/orgChart';
import Avatar from '@/components/ui/Avatar';
import styles from './OrgTreeView.module.css';

interface Props {
  nodes: OrgNode[];
  levelColors: Record<number, string>;
  levelNames: Record<number, string>;
  /** Dispara ao escolher um nó — normalmente "voa até" ele no modo radial. */
  onSelect: (node: OrgNode) => void;
}

/** Cor representativa do nó: cor do setor quando aplicável, senão a do nível. */
function nodeColor(node: OrgNode, levelColors: Record<number, string>): string {
  return node.isSector ? (node.sectorColor ?? levelColors[2]) : (levelColors[node.level] ?? '#94a3b8');
}

export default function OrgTreeView({ nodes, levelColors, levelNames, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Filhos indexados por parentId, preservando a ordem de chegada.
  const childrenOf = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      if (!map.has(n.parentId)) map.set(n.parentId, []);
      map.get(n.parentId)!.push(n);
    }
    return map;
  }, [nodes]);

  const roots = useMemo(() => nodes.filter((n) => !n.parentId), [nodes]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return nodes
      .filter((n) => `${n.name} ${n.role}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [query, nodes]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderRow(node: OrgNode, depth: number) {
    const kids = childrenOf.get(node.id) ?? [];
    const hasKids = kids.length > 0;
    const isCollapsed = collapsed.has(node.id);
    const color = nodeColor(node, levelColors);
    const label = node.name?.trim() || node.role || '—';
    const sub = node.isSector ? (node.role || 'Setor') : (node.role || levelNames[node.level]);

    return (
      <div key={node.id}>
        <div className={styles.row} style={{ paddingLeft: 8 + depth * 18 }}>
          <button
            type="button"
            className={styles.twisty}
            onClick={() => hasKids && toggle(node.id)}
            aria-label={hasKids ? (isCollapsed ? 'Expandir' : 'Recolher') : undefined}
            data-empty={!hasKids}
          >
            {hasKids ? (isCollapsed ? '▸' : '▾') : ''}
          </button>

          <button type="button" className={styles.rowMain} onClick={() => onSelect(node)}>
            <span className={styles.dot} style={{ background: color }} />
            <Avatar photoUrl={node.photoUrl ?? ''} name={label} size={26} color={color} />
            <span className={styles.rowText}>
              <span className={styles.rowName}>{label}</span>
              <span className={styles.rowSub}>{sub}</span>
            </span>
            {hasKids && <span className={styles.count}>{kids.length}</span>}
          </button>
        </div>

        {hasKids && !isCollapsed && kids.map((k) => renderRow(k, depth + 1))}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          className={styles.search}
          placeholder="Buscar pessoa, cargo ou setor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Limpar busca">×</button>
        )}
      </div>

      <div className={styles.scroll}>
        {matches ? (
          matches.length === 0 ? (
            <div className={styles.empty}>Nenhum resultado para “{query}”.</div>
          ) : (
            matches.map((node) => {
              const color = nodeColor(node, levelColors);
              const label = node.name?.trim() || node.role || '—';
              return (
                <button key={node.id} type="button" className={styles.matchRow} onClick={() => onSelect(node)}>
                  <Avatar photoUrl={node.photoUrl ?? ''} name={label} size={28} color={color} />
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{label}</span>
                    <span className={styles.rowSub}>{node.isSector ? (node.role || 'Setor') : (node.role || levelNames[node.level])}</span>
                  </span>
                </button>
              );
            })
          )
        ) : (
          roots.map((r) => renderRow(r, 0))
        )}
      </div>
    </div>
  );
}
