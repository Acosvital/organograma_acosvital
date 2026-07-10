'use client';

import { useEffect, useState } from 'react';
import { cachedFetch, isCacheHit, CACHE_KEYS, CACHE_TTL } from '@/lib/dataCache';
import { toVideoEmbedUrl } from '@/lib/videoEmbed';
import type { HistoriaContent } from '@/types/historia';
import styles from './HistoriaView.module.css';

export default function HistoriaView() {
  const [historia, setHistoria] = useState<HistoriaContent | null>(null);
  const [loading,  setLoading]  = useState(() => !isCacheHit(CACHE_KEYS.HISTORIA, CACHE_TTL.LONG));
  const [error,    setError]    = useState(false);

  useEffect(() => {
    let cancelled = false;

    cachedFetch<HistoriaContent>(
      CACHE_KEYS.HISTORIA,
      () => fetch('/api/historia').then(r => {
        if (!r.ok) throw new Error('Falha ao carregar história.');
        return r.json();
      }),
      CACHE_TTL.LONG,
    )
      .then(data => { if (!cancelled) setHistoria(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const embedUrl = historia?.videoUrl ? toVideoEmbedUrl(historia.videoUrl) : null;
  const paragraphs = historia?.texto.split(/\n\s*\n/).filter(p => p.trim()) ?? [];
  const timeline = historia?.timeline ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        {loading && (
          <p className={styles.status}>Carregando…</p>
        )}

        {!loading && error && (
          <p className={styles.status}>Não foi possível carregar esta página.</p>
        )}

        {!loading && !error && historia && (
          <>
            <h1 className={styles.title}>{historia.titulo}</h1>

            {paragraphs.length === 0 && historia.imagens.length === 0 && !embedUrl && timeline.length === 0 ? (
              <p className={styles.status}>Conteúdo ainda não cadastrado.</p>
            ) : (
              <>
                {paragraphs.length > 0 && (
                  <div className={styles.text}>
                    {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                )}

                {timeline.length > 0 && (
                  <div className={styles.timeline}>
                    {timeline.map(item => (
                      <div key={item.id} className={styles.timelineItem}>
                        <div className={styles.timelineMarker}>
                          <span className={styles.timelineYear}>{item.ano}</span>
                          <span className={styles.timelineDot} />
                        </div>
                        <div className={styles.timelineBody}>
                          {item.imagemUrl && (
                            <img src={item.imagemUrl} alt="" className={styles.timelineImg} loading="lazy" />
                          )}
                          <h3 className={styles.timelineTitle}>{item.titulo}</h3>
                          {item.descricao && <p className={styles.timelineDesc}>{item.descricao}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {embedUrl && (
                  <div className={styles.videoWrap}>
                    <iframe
                      src={embedUrl}
                      title={historia.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                {historia.imagens.length > 0 && (
                  <div className={styles.gallery}>
                    {historia.imagens.map(img => (
                      <figure key={img.id} className={styles.galleryItem}>
                        <img src={img.url} alt={img.legenda || historia.titulo} loading="lazy" />
                        {img.legenda && <figcaption>{img.legenda}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
