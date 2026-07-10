'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Unidade } from '@/types/adminCore';
import { cachedFetch, isCacheHit, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';
import styles from './UnidadeSelectorView.module.css';

function IcoBuilding() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h20"/>
      <path d="M10 7h4M10 11h4M10 15h4"/>
    </svg>
  );
}

function IcoArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export default function UnidadeSelectorView() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading]   = useState(() => !isCacheHit(CACHE_KEYS.UNIDADES_ORG, CACHE_TTL.LONG));
  const [error,   setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;

    cachedFetch<Unidade[]>(
      CACHE_KEYS.UNIDADES_ORG,
      () => fetch('/api/unidades').then(r => r.json()),
      CACHE_TTL.LONG,
    )
      .then(data => { if (!cancelled && Array.isArray(data)) setUnidades(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        <p className={styles.prompt}>Organograma — selecione uma unidade</p>

        {loading && unidades.length === 0 && (
          <p className={styles.status}>Carregando unidades…</p>
        )}
        {!loading && error && unidades.length === 0 && (
          <p className={styles.status}>Não foi possível carregar as unidades.</p>
        )}
        {!loading && !error && unidades.length === 0 && (
          <p className={styles.status}>Nenhuma unidade cadastrada ainda.</p>
        )}

        <div className={styles.grid}>
          {unidades.map(u => (
            <Link key={u.id} href={`/organograma/${u.id}`} className={styles.card}>
              <div className={styles.cardIcon}><IcoBuilding /></div>
              <p className={styles.cardTitle}>{u.nome_fantasia}</p>
              <div className={styles.cardMeta}>
                <span className={styles.badge}>{u.tipo_unidade === 'matriz' ? 'Matriz' : 'Filial'}</span>
                {(u.cidade || u.estado) && (
                  <span className={styles.cardLocation}>
                    {[u.cidade, u.estado].filter(Boolean).join(' / ')}
                  </span>
                )}
              </div>
              <span className={styles.cardArrow}><IcoArrow /></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
