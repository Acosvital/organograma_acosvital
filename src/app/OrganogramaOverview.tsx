'use client';

import { useRef, useState, useLayoutEffect } from 'react';
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
  /** Cor do card desta unidade (Administrar → Cadastrar unidades), ou null para a cor padrão do nível. */
  cardColor?: string | null;
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

export default function OrganogramaOverview({ directorsNode, unidadesComGerentes, error = false }: Props) {
  const stageRef     = useRef<HTMLDivElement>(null);
  const directorsRef = useRef<HTMLDivElement>(null);
  const scrollRef    = useRef<HTMLDivElement>(null);

  const trunkPath = useTrunkPath(stageRef, directorsRef, scrollRef);
  const fsMode = useFsMode();

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

        {/* Fileira de matriz + filiais, cada uma com sua própria linha descendo
         * da espinha horizontal (uma linha por empresa). */}
        <div ref={scrollRef} className={styles.row}>
          {unidadesComGerentes.length > 0 && (
            <div className={styles.track}>
              {unidadesComGerentes.length > 1 && <div className={styles.spine} />}
              {unidadesComGerentes.map(({ unidade, node, cardColor }) => (
                <div key={unidade.id} className={styles.item}>
                  <div className={styles.drop} />
                  <Link href={`/organograma/${unidade.id}`} className={styles.unitLink} draggable={false}>
                    {node
                      ? <CircleSvg node={node} color={cardColor ?? levelColors[1]} />
                      : <PlaceholderCircle label={unidade.nome_fantasia} />}
                  </Link>
                </div>
              ))}
            </div>
          )}

          {!error && unidadesComGerentes.length === 0 && (
            <p className={styles.status}>Nenhuma unidade cadastrada ainda.</p>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
