import { PositionedNode } from '@/types/orgChart';
import { colorGradientId } from '@/utils/svgDefs';
import styles from './SectorCard.module.css';

interface Props {
  node: PositionedNode;
  color: string;
  onClick: () => void;
  /** Oculta labels de nome (modo fullscreen limpo) */
  hideText?: boolean;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function abbrev(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function splitLine(name: string): [string, string | null] {
  if (name.length <= 10) return [name, null];
  const words = name.split(' ');
  if (words.length < 2) return [name, null];
  const mid = Math.ceil(words.length / 2);
  const l1 = words.slice(0, mid).join(' ');
  const l2 = words.slice(mid).join(' ');
  return [l1, l2 || null];
}

export default function SectorCard({ node, color, onClick, hideText = false }: Props) {
  const r = node.radius;
  const [line1, line2] = splitLine(node.name);

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className={styles.group}
      data-sector-id={node.id}
      onClick={(e) => { if (e.detail === 0) onClick(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Abrir setor ${node.name}`}
    >
      <title>Setor: {node.name} — clique para expandir</title>

      <g className={styles.visual}>
        {/* Outer glow */}
        <circle cx={0} cy={0} r={r + 10} fill={color} fillOpacity={0.08} />

        {/* Dashed ring — gira no hover via CSS */}
        <circle
          cx={0} cy={0} r={r + 4}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.3}
          strokeDasharray="4 3"
          className={styles.dashRing}
        />

        {/* Main border */}
        <circle
          cx={0} cy={0} r={r + 2}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeOpacity={0.85}
          className={styles.border}
        />

        {/* Background fill — gradiente compartilhado por cor (ver OrgChart <defs>) */}
        <circle cx={0} cy={0} r={r} fill={`url(#${colorGradientId(color)})`} />

        {/* Abbreviation (always shown) */}
        <text
          x={0} y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={r * 0.52}
          fontWeight="800"
          fontFamily={FONT}
          opacity={0.55}
        >
          {abbrev(node.name)}
        </text>
      </g>

      {!hideText && (
        <>
          {/* Sector name — line 1 */}
          <text
            x={0} y={r + 16}
            textAnchor="middle"
            style={{ fill: 'var(--text-primary)' }}
            fontSize={10}
            fontWeight="700"
            fontFamily={FONT}
          >
            {line1}
          </text>

          {/* Sector name — line 2 */}
          {line2 && (
            <text
              x={0} y={r + 29}
              textAnchor="middle"
              style={{ fill: 'var(--text-primary)' }}
              fontSize={10}
              fontWeight="700"
              fontFamily={FONT}
            >
              {line2}
            </text>
          )}

          {/* "ver equipe" hint */}
          <text
            x={0} y={r + (line2 ? 43 : 30)}
            textAnchor="middle"
            fill={color}
            fontSize={8}
            fontFamily={FONT}
            opacity={0.6}
          >
            ver equipe
          </text>
        </>
      )}
    </g>
  );
}
