'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrgNode } from '@/types/orgChart';
import Avatar from '@/components/ui/Avatar';
import OnScreenKeyboard from '@/components/OnScreenKeyboard/OnScreenKeyboard';
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

/** IDs de nós podem vir com um prefixo curto de origem antes do UUID puro —
 *  'sec-' para setores importados via Supabase (ver radialLayout.ts/org.ts),
 *  'rh-' para o parentId de setores que reportam a um gerente/diretor. Remove
 *  qualquer prefixo desse tipo para comparar sempre pelo UUID canônico —
 *  sem isso, um setor cujo parentId é "rh-<uuid-do-gerente>" nunca encontra
 *  o pai (cujo id é só "<uuid-do-gerente>", sem prefixo), e a árvore inteira
 *  abaixo dele — inclusive todos os funcionários do setor — some da Lista. */
function canonId(id: string): string {
  const m = id.match(/^[a-z]+-([0-9a-f-]{36})$/i);
  return m ? m[1] : id;
}

export default function OrgTreeView({ nodes, levelColors, levelNames, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [kbOpen, setKbOpen] = useState(false);
  // Sobe quando um keydown REAL chega no input (só hardware físico dispara
  // isso — o teclado virtual atualiza `query` via prop, nunca via evento
  // nativo no input) — mesmo padrão de OrgChart.tsx.
  const [physicalKeyboardActive, setPhysicalKeyboardActive] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Filhos indexados pelo parentId canônico, preservando a ordem de chegada.
  const childrenOf = useMemo(() => {
    const map = new Map<string, OrgNode[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const key = canonId(n.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return map;
  }, [nodes]);

  // Um setor pode reportar a um gerente/diretor de OUTRA unidade — esse gerente
  // é removido de `nodes` (que só traz pessoas desta unidade, além de setores e
  // diretoria), então o parentId do setor não aponta para ninguém presente aqui.
  // Sem isso, o setor (e toda a equipe dele) some da lista por falta de um pai
  // visível — em vez disso, trata como raiz própria, igual à Diretoria.
  const idSet = useMemo(() => new Set(nodes.map((n) => canonId(n.id))), [nodes]);
  const roots = useMemo(
    () => nodes.filter((n) => !n.parentId || !idSet.has(canonId(n.parentId))),
    [nodes, idSet],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return nodes
      .filter((n) => `${n.name} ${n.role}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [query, nodes]);

  // Fecha o teclado virtual ao tocar/clicar fora dele — mesmo padrão de OrgChart.tsx.
  useEffect(() => {
    if (!kbOpen) return;
    const onPointerDownOutside = (e: PointerEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setKbOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDownOutside);
    return () => document.removeEventListener('pointerdown', onPointerDownOutside);
  }, [kbOpen]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderRow(node: OrgNode, depth: number) {
    const kids = childrenOf.get(canonId(node.id)) ?? [];
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
      <div className={styles.searchWrap} ref={searchWrapRef}>
        <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          className={styles.search}
          placeholder="Buscar pessoa, cargo ou setor…"
          value={query}
          inputMode="none"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setKbOpen(true); setPhysicalKeyboardActive(false); }}
          onKeyDown={() => setPhysicalKeyboardActive(true)}
          // Sem autoFocus: abriria o teclado virtual assim que a Lista monta,
          // cobrindo a árvore de pessoas com o overlay do teclado (só a Diretoria,
          // no topo, ficava visível) — o teclado deve abrir só quando a pessoa
          // realmente tocar/clicar no campo de busca.
        />
        {query && (
          <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label="Limpar busca">×</button>
        )}
        {kbOpen && !physicalKeyboardActive && (
          <OnScreenKeyboard
            value={query}
            onChange={setQuery}
            onEnter={() => { if (matches?.[0]) onSelect(matches[0]); }}
            onClose={() => setKbOpen(false)}
          />
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
