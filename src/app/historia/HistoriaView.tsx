'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { HistoriaContent, HistoriaTimelineItem } from '@/types/historia';
import styles from './HistoriaView.module.css';

interface Props {
  historia: HistoriaContent | null;
  error?: boolean;
}

/** Distância (px) que o ponteiro precisa se mover para contar como arraste —
 *  abaixo disso é clique normal (mesmo padrão usado na fileira de unidades
 *  do organograma, ver OrganogramaOverview.tsx). */
const DRAG_THRESHOLD = 6;

export default function HistoriaView({ historia, error = false }: Props) {
  const paragraphs = historia?.texto.split(/\n\s*\n/).filter(p => p.trim()) ?? [];
  const timeline = useMemo(
    () => [...(historia?.timeline ?? [])].sort((a, b) => a.ano - b.ano),
    [historia],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<{ startX: number; startScroll: number; dragging: boolean; moved: boolean; pointerId: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(timeline[0]?.id ?? null);

  const updateProgress = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);

    // Marca como "ativo" o card mais próximo do centro do palco — acompanha o
    // arraste para destacar em qual momento da história o usuário está.
    const stageCenter = el.getBoundingClientRect().left + el.clientWidth / 2;
    let closestId: string | null = null;
    let closestDist = Infinity;
    cardRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect();
      const dist = Math.abs(rect.left + rect.width / 2 - stageCenter);
      if (dist < closestDist) { closestDist = dist; closestId = id; }
    });
    setActiveId(closestId);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || e.button !== 0) return;
    // Touch/caneta: deixa o scroll nativo (touch-action: pan-x) cuidar do
    // gesto — já vem com inércia e cancela o clique sozinho quando é arraste
    // de verdade. Simular o arraste também nesses casos faz o scroll "brigar"
    // consigo mesmo (mesmo raciocínio de OrganogramaOverview.tsx).
    if (e.pointerType !== 'mouse') return;
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, dragging: true, moved: false, pointerId: e.pointerId };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    const st = dragRef.current;
    if (!el || !st?.dragging) return;
    const dx = e.clientX - st.startX;
    if (!st.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      st.moved = true;
      el.setPointerCapture(st.pointerId);
    }
    if (st.moved) {
      e.preventDefault();
      el.scrollLeft = st.startScroll - dx;
      updateProgress();
    }
  }, [updateProgress]);

  const endDrag = useCallback(() => {
    if (dragRef.current) dragRef.current.dragging = false;
  }, []);

  // Evita que soltar o ponteiro após um arraste dispare navegação/clique no card.
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const scrollToItem = useCallback((id: string) => {
    cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, []);

  const nudge = useCallback((dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(340, el.clientWidth * 0.7), behavior: 'smooth' });
  }, []);

  const hasContent = paragraphs.length > 0 || timeline.length > 0;

  return (
    <div className={styles.page}>
      {historia?.backgroundImageUrl && (
        <div className={styles.bgImage} style={{ backgroundImage: `url(${historia.backgroundImageUrl})` }} />
      )}
      <div className={styles.bgGradient} />

      <div className={styles.content}>
        {error && <p className={styles.status}>Não foi possível carregar esta página.</p>}

        {!error && historia && (
          !hasContent ? (
            <p className={styles.status}>Conteúdo ainda não cadastrado.</p>
          ) : (
            <>
              <div className={styles.header}>
                <p className={styles.prompt}>Nossa História</p>
                <h1 className={styles.title}>{historia.titulo}</h1>
                {paragraphs.length > 0 && (
                  <div className={styles.intro}>
                    {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                )}
              </div>

              {timeline.length > 0 && (
                <div className={styles.timelineStage}>
                  <button
                    type="button"
                    className={`${styles.navBtn} ${styles.navBtnLeft}`}
                    onClick={() => nudge(-1)}
                    aria-label="Voltar no tempo"
                  >
                    ‹
                  </button>

                  <div
                    ref={scrollerRef}
                    className={styles.scroller}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerLeave={endDrag}
                    onPointerCancel={endDrag}
                    onClickCapture={onClickCapture}
                    onScroll={updateProgress}
                  >
                    <div className={styles.track}>
                      <div className={styles.trackLine} />
                      {timeline.map((item: HistoriaTimelineItem) => (
                        <div
                          key={item.id}
                          ref={node => {
                            if (node) cardRefs.current.set(item.id, node);
                            else cardRefs.current.delete(item.id);
                          }}
                          className={`${styles.item} ${activeId === item.id ? styles.itemActive : ''}`}
                        >
                          <span className={styles.dot} />
                          <button
                            type="button"
                            className={styles.yearBtn}
                            onClick={() => scrollToItem(item.id)}
                          >
                            {item.ano}
                          </button>
                          <div className={styles.card}>
                            {item.imagemUrl && (
                              <div className={styles.cardImgWrap}>
                                <img src={item.imagemUrl} alt="" className={styles.cardImg} loading="lazy" draggable={false} />
                              </div>
                            )}
                            <div className={styles.cardBody}>
                              <h3 className={styles.cardTitle}>{item.titulo}</h3>
                              {item.descricao && <p className={styles.cardDesc}>{item.descricao}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className={styles.trackEndSpacer} />
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`${styles.navBtn} ${styles.navBtnRight}`}
                    onClick={() => nudge(1)}
                    aria-label="Avançar no tempo"
                  >
                    ›
                  </button>

                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className={styles.dragHint}>Arraste para explorar a linha do tempo</p>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
