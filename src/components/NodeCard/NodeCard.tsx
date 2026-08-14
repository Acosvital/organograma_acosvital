import { memo } from 'react';
import { PositionedNode } from '@/types/orgChart';
import { colorGradientId, radiusClipId } from '@/utils/svgDefs';
import styles from './NodeCard.module.css';

interface Props {
  node: PositionedNode;
  color: string;
  /** Current viewBox width — used to compute apparent on-screen radius for LOD */
  vbW: number;
  /** Oculta labels de texto (modo fullscreen limpo) */
  hideText?: boolean;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function getShortName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// Approximate on-screen radius (assumes ~900px display width)
function screenR(svgR: number, vbW: number): number {
  return svgR * (900 / vbW);
}

function NodeCardInner({ node, color, vbW, hideText = false }: Props) {
  const r = node.radius;
  const sr = screenR(r, vbW);
  const showImage = sr >= 9 && !!node.photoUrl;
  const showLabel = sr >= 13 && !hideText;
  const fontSize = r <= 13 ? 8 : r <= 20 ? 9 : 10;

  return (
    <g transform={`translate(${node.x}, ${node.y})`} className={styles.group} {...({ title: `${node.name} — ${node.role}` } as { title?: string })}>
      <g className={styles.visual}>
        {/* Outer glow (neon em camadas) */}
        <circle cx={0} cy={0} r={r + 12} fill={color} fillOpacity={0.06} />
        <circle cx={0} cy={0} r={r + 5}  fill={color} fillOpacity={0.16} />

        {/* Border */}
        <circle cx={0} cy={0} r={r + 2} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.75} className={styles.ring} />

        {/* Background com gradiente da cor do nível — compartilhado por cor (ver OrgChart <defs>) */}
        <circle cx={0} cy={0} r={r} fill={`url(#${colorGradientId(color)})`} />

        {/* Initials fallback */}
        {!showImage && (
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={color} fontSize={r * 0.52} fontWeight="700" fontFamily={FONT}>
            {getInitials(node.name)}
          </text>
        )}

        {/* Photo */}
        {showImage && (
          <image
            href={node.photoUrl}
            x={-r} y={-r}
            width={r * 2} height={r * 2}
            clipPath={`url(#${radiusClipId(r)})`}
            preserveAspectRatio="xMidYMid slice"
          />
        )}
      </g>

      {/* Labels (only when node is large enough on screen) */}
      {showLabel && (
        <>
          <text x={0} y={r + 14} textAnchor="middle" style={{ fill: 'var(--text-primary)' }} fontSize={fontSize} fontWeight="600" fontFamily={FONT}>
            {getShortName(node.name)}
          </text>
          <text x={0} y={r + 26} textAnchor="middle" fill={color} fontSize={fontSize - 1} fontFamily={FONT} opacity={0.88}>
            {truncate(node.role, 22)}
          </text>
        </>
      )}
    </g>
  );
}

function propsAreEqual(prev: Props, next: Props): boolean {
  if (prev.node !== next.node || prev.color !== next.color) return false;
  if (prev.hideText !== next.hideText) return false;
  const prevSR = screenR(prev.node.radius, prev.vbW);
  const nextSR = screenR(next.node.radius, next.vbW);
  return (prevSR >= 9) === (nextSR >= 9) && (prevSR >= 13) === (nextSR >= 13);
}

const NodeCard = memo(NodeCardInner, propsAreEqual);
export default NodeCard;
