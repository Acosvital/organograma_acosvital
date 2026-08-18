'use client';

import { useRef, useCallback, useState, useLayoutEffect } from 'react';
import Link from 'next/link';
import CenterCard from '@/components/CenterCard/CenterCard';
import SpaceBackground from '@/components/Globe/SpaceBackground';
import { levelColors } from '@/data/orgData';
import { useFsMode } from '@/lib/fsContext';
import type { PositionedNode } from '@/types/orgChart';
import type { Unidade } from '@/types/adminCore';
import styles from './OrganogramaOverview.module.css';

const SIZE   = 280; // viewBox das unidades — cobre a aura do CenterCard (raio ~127) + labels abaixo
const CENTER = SIZE / 2;

// Card da diretoria: maior que os das unidades e ancorado no topo do seu próprio
// quadro (por isso o quadro é mais alto que largo) — resulta visualmente "mais para cima".
const DIRECTOR_SCALE = 1.35;
const DIRECTOR_W     = 360;
const DIRECTOR_H     = 340;
const DIRECTOR_CX    = DIRECTOR_W / 2;
const DIRECTOR_CY    = 175;

export interface UnidadeOverviewEntry {
  unidade: Unidade;
  node: PositionedNode | null;
}

interface Props {
  directorsNode: PositionedNode | null;
  unidadesComGerentes: UnidadeOverviewEntry[];
  error?: boolean;
}

interface CircleGeometry {
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  scale?: number;
}

function CircleSvg({ node, color, width = SIZE, height = SIZE, cx = CENTER, cy = CENTER, scale = 1 }: CircleGeometry & { node: PositionedNode; color: string }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <g transform={`translate(${cx}, ${cy}) scale(${scale})`}>
        <CenterCard node={node} color={color} />
      </g>
    </svg>
  );
}

function PlaceholderCircle({ label, width = SIZE, height = SIZE, cx = CENTER, cy = CENTER, scale = 1 }: CircleGeometry & { label: string }) {
  const r = 75 * scale;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={2} strokeDasharray="5 6" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={22 * scale} fill="var(--text-faint)">?</text>
      <text x={cx} y={cy + r + 24} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text-secondary)">
        {label}
      </text>
    </svg>
  );
}

/** Tronco vertical que desce do centro do card da diretoria até o topo da
 *  fileira de matriz/filiais — pequeno jog horizontal só se os centros não
 *  coincidirem exatamente (ex.: diretoria mais estreita que a fileira). */
function useTrunkPath(stageRef: React.RefObject<HTMLDivElement | null>, directorsRef: React.RefObject<HTMLDivElement | null>, rowRef: React.RefObject<HTMLDivElement | null>) {
  const [path, setPath] = useState<string | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current, directors = directorsRef.current, row = rowRef.current;
    if (!stage || !directors || !row) return;

    const recompute = () => {
      const stageBox     = stage.getBoundingClientRect();
      const directorsBox = directors.getBoundingClientRect();
      const rowBox       = row.getBoundingClientRect();

      const x1 = directorsBox.left - stageBox.left + DIRECTOR_CX;
      const y1 = directorsBox.top  - stageBox.top  + DIRECTOR_CY + 75 * DIRECTOR_SCALE + 14; // borda inferior do círculo
      const x2 = rowBox.left - stageBox.left + rowBox.width / 2;
      const y2 = rowBox.top  - stageBox.top;
      const bend = Math.min(28, Math.abs(y2 - y1) / 2 || 1);

      setPath(
        Math.abs(x2 - x1) < 1
          ? `M ${x1} ${y1} L ${x2} ${y2}` // centros coincidem: linha reta
          : `M ${x1} ${y1} L ${x1} ${y2 - bend} Q ${x1} ${y2} ${x1 + Math.sign(x2 - x1) * bend} ${y2} L ${x2} ${y2}`,
      );
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(stage);
    ro.observe(directors);
    ro.observe(row);
    return () => ro.disconnect();
  }, [stageRef, directorsRef, rowRef]);

  return path;
}

/** Distância (px) que o ponteiro precisa se mover para contar como arraste — abaixo
 *  disso, o gesto é tratado como clique normal e a navegação do link é permitida. */
const DRAG_THRESHOLD = 6;

export default function OrganogramaOverview({ directorsNode, unidadesComGerentes, error = false }: Props) {
  const stageRef     = useRef<HTMLDivElement>(null);
  const directorsRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const dragRef      = useRef<{ startX: number; startScroll: number; dragging: boolean; moved: boolean; pointerId: number } | null>(null);

  const trunkPath = useTrunkPath(stageRef, directorsRef, scrollRef);
  const fsMode = useFsMode();

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    // Touch/caneta: deixa o scroll nativo (touch-action: pan-x) cuidar do gesto —
    // já vem com inércia e cancela o clique sozinho quando é um arraste de verdade.
    // Rodar nossa simulação de arraste também nesses casos faz o scroll "brigar"
    // consigo mesmo (dobra o movimento, trava, pula) — por isso só entra pro mouse.
    if (e.pointerType !== 'mouse') return;
    // Não captura o ponteiro aqui — capturar cedo demais faz o navegador nunca
    // disparar o "click" nativo no link da unidade, quebrando a navegação por clique.
    dragRef.current = { startX: e.clientX, startScroll: el.scrollLeft, dragging: true, moved: false, pointerId: e.pointerId };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const st = dragRef.current;
    if (!el || !st?.dragging) return;
    const dx = e.clientX - st.startX;
    if (!st.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      st.moved = true;
      // Só captura o ponteiro quando um arraste de verdade começa — assim o
      // scroll continua acompanhando o mouse mesmo se ele sair da fileira.
      el.setPointerCapture(st.pointerId);
    }
    if (st.moved) {
      e.preventDefault();
      el.scrollLeft = st.startScroll - dx;
    }
  }, []);

  const endDrag = useCallback(() => {
    if (dragRef.current) dragRef.current.dragging = false;
  }, []);

  // Evita que soltar o ponteiro após um arraste dispare a navegação do link da unidade.
  const onRowClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div className={styles.page}>
      <SpaceBackground />

      <div className={`${styles.content} ${fsMode !== 'none' ? styles.shifted : ''}`}>
      <p className={styles.prompt}>Organograma — visão geral</p>

      {error && <p className={styles.status}>Não foi possível carregar os dados.</p>}

      <div className={styles.stage} ref={stageRef}>
        {/* Diretores compartilhados — fixos fora da fileira, sempre visíveis */}
        <div className={styles.directorsZone} ref={directorsRef}>
          {directorsNode
            ? <CircleSvg node={directorsNode} color={levelColors[0]} width={DIRECTOR_W} height={DIRECTOR_H} cx={DIRECTOR_CX} cy={DIRECTOR_CY} scale={DIRECTOR_SCALE} />
            : <PlaceholderCircle label="Diretoria" width={DIRECTOR_W} height={DIRECTOR_H} cx={DIRECTOR_CX} cy={DIRECTOR_CY} scale={DIRECTOR_SCALE} />}
        </div>

        {/* Conector: tronco descendo do card da diretoria até a fileira abaixo */}
        {trunkPath && (
          <svg className={styles.elbowOverlay}>
            <path d={trunkPath} fill="none" stroke="var(--border-light)" strokeWidth={3} />
          </svg>
        )}

        {/* Fileira arrastável — matriz + filiais, uma unidade leva à outra */}
        <div
          ref={scrollRef}
          className={styles.row}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onRowClickCapture}
        >
          {unidadesComGerentes.map(({ unidade, node }, i) => (
            <div key={unidade.id} className={styles.item}>
              {i > 0 && <div className={styles.connector} />}
              <Link href={`/organograma/${unidade.id}`} className={styles.unitLink} draggable={false}>
                {node
                  ? <CircleSvg node={node} color={levelColors[1]} />
                  : <PlaceholderCircle label={unidade.nome_fantasia} />}
              </Link>
            </div>
          ))}

          {!error && unidadesComGerentes.length === 0 && (
            <p className={styles.status}>Nenhuma unidade cadastrada ainda.</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
